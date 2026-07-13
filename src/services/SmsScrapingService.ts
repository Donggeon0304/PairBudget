/**
 * SMS 스크래핑 서비스
 * 
 * 문자함에서 은행/카드 문자를 읽어 파싱하고,
 * 이미 등록된 거래와 대기 중인 거래, 제외된 거래를 제외하여
 * 미등록 건만 반환합니다.
 */

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import {
  parseNotification,
  isBankSms,
  generateTransactionHash,
} from './BankNotificationParser';
import { getPendingTransactions, getRejectedHashes } from './NotificationService';
import type { ParsedNotification } from '../types';

const { SmsReader } = NativeModules;

export interface ScrapedSms {
  id: string;
  parsed: ParsedNotification;
  smsDate: Date;
  rawBody: string;
}

export interface ScrapeResult {
  items: ScrapedSms[];
  debug: {
    totalSms: number;
    bankSmsCount: number;
    parsedCount: number;
    dedupedCount: number;
  };
}

/**
 * READ_SMS 권한 요청
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: '문자 읽기 권한',
        message: '미등록 거래 내역을 문자함에서 가져오기 위해 문자 읽기 권한이 필요합니다.',
        buttonPositive: '허용',
        buttonNegative: '거부',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * READ_SMS 권한 확인
 */
export async function checkSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  } catch {
    return false;
  }
}

/**
 * 문자함에서 미등록 거래 스크래핑
 * @param daysBack 며칠 전까지 스캔 (기본 7일)
 * @param householdId Firestore 가계부 ID (중복 체크용)
 */
export async function scrapeSmsTransactions(
  daysBack: number = 7,
  householdId: string,
): Promise<ScrapeResult> {
  // 1. 권한 체크
  const hasPermission = await checkSmsPermission();
  if (!hasPermission) {
    const granted = await requestSmsPermission();
    if (!granted) {
      throw new Error('SMS_PERMISSION_DENIED');
    }
  }

  // 2. SMS 읽기 (네이티브 모듈)
  const rawSmsList: Array<{
    id: string;
    address: string;
    body: string;
    date: number;
  }> = await SmsReader.readSms(daysBack);

  console.log(`[SmsScrapingService] 총 SMS: ${rawSmsList.length}건`);

  // 3. 금융 문자만 필터 + 파싱
  const parsedList: ScrapedSms[] = [];
  let bankSmsCount = 0;

  for (const sms of rawSmsList) {
    // RCS JSON body에서 실제 텍스트 추출
    let actualBody = sms.body || '';
    if (actualBody.trimStart().startsWith('{')) {
      const extracted = extractRcsDescription(actualBody);
      if (extracted) {
        actualBody = extracted;
      }
    }

    const bodyPreview = actualBody.replace(/\n/g, ' ').substring(0, 80);
    const isBankMsg = isBankSms(actualBody);
    console.log(`[SmsScrapingService] SMS[${sms.id}] addr=${sms.address} isBank=${isBankMsg} body="${bodyPreview}..."`);

    // 금융 문자인지 확인 (금액 패턴 + 은행 키워드)
    if (!isBankMsg) continue;
    bankSmsCount++;

    // 기존 파서로 파싱 (추출된 텍스트 사용)
    const parsed = parseNotification(actualBody, 'com.samsung.android.messaging');

    console.log(`[SmsScrapingService] 파싱결과: amount=${parsed.amount} merchant=${parsed.merchant} type=${parsed.incomeOrExpense}`);

    // 금액이 없으면 스킵
    if (!parsed.amount || parsed.amount <= 0) continue;

    // 취소 건은 스킵
    if (parsed.transactionType === 'cancel') continue;

    parsedList.push({
      id: `sms_${sms.id}`,
      parsed,
      smsDate: new Date(sms.date),
      rawBody: sms.body,
    });
  }

  console.log(`[SmsScrapingService] 금융 문자: ${bankSmsCount}건, 파싱 성공: ${parsedList.length}건`);

  // 4. 이미 등록된 거래 제외 (Firestore)
  const existingHashes = new Set<string>();
  // 금액+날짜시간 매칭 시 은행명 확인용: Map<AmountDateKey, Set<CardIssuer>>
  const existingAmountDateIssuers = new Map<string, Set<string>>();

  // 최근 거래의 txHash 수집 (기간 + 여유 1일)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (daysBack + 1));

  try {
    const txSnap = await firestore()
      .collection('households').doc(householdId)
      .collection('transactions')
      .where('date', '>=', cutoffDate)
      .get();

    txSnap.docs.forEach(doc => {
      const data = doc.data();
      const hash = data.txHash;
      if (hash) existingHashes.add(hash);

      // 금액+날짜시간 키 (같은 날 같은 시간 같은 금액 + 같은 은행 = 중복)
      if (data.amount && data.date) {
        const d = data.date.toDate ? data.date.toDate() : new Date(data.date);
        const dateKey = `${d.getMonth()+1}/${d.getDate()}_${d.getHours()}:${d.getMinutes()}`;
        const amountDateKey = `${Math.abs(data.amount)}_${dateKey}`;
        
        if (!existingAmountDateIssuers.has(amountDateKey)) {
          existingAmountDateIssuers.set(amountDateKey, new Set());
        }
        
        // 은행명이 없으면 'unknown'으로 저장해서 비교
        const issuer = data.cardIssuer ? data.cardIssuer.toLowerCase().replace(/\s+/g, '') : 'unknown';
        existingAmountDateIssuers.get(amountDateKey)!.add(issuer);
      }
    });
  } catch (e) {
    console.warn('[SmsScrapingService] Firestore 조회 실패:', e);
  }

  // 5. 대기 중인 거래의 txHash도 수집
  try {
    const pending = await getPendingTransactions();
    pending.forEach(p => {
      if (p.parsed.amount && p.parsed.merchant) {
        const hash = generateTransactionHash(
          p.parsed.amount,
          p.parsed.merchant,
          p.parsed.dateTime,
          p.parsed.cardIssuer,
        );
        existingHashes.add(hash);
      }
    });
  } catch (e) {
    console.warn('[SmsScrapingService] 대기 내역 조회 실패:', e);
  }

  // 6. 제외된 거래 해시 수집
  let rejectedHashes: string[] = [];
  try {
    rejectedHashes = await getRejectedHashes();
    rejectedHashes.forEach(h => existingHashes.add(h));
  } catch (e) {
    console.warn('[SmsScrapingService] 제외 내역 조회 실패:', e);
  }

  // 7. 중복 제거 (같은 문자가 여러 번 파싱되는 경우 방지)
  const seenHashes = new Set<string>();
  const result: ScrapedSms[] = [];

  for (const item of parsedList) {
    const hash = generateTransactionHash(
      item.parsed.amount!,
      item.parsed.merchant,
      item.parsed.dateTime,
      item.parsed.cardIssuer,
    );

    // 이미 등록됨 or 대기 중 or 제외됨 → 스킵 (해시 매칭)
    if (existingHashes.has(hash)) continue;

    // 금액+시간 근사 매칭 (해시 불일치 대비 + 같은 은행 여부 확인)
    // parsed.dateTime = "06/28 03:46" 형태
    if (item.parsed.dateTime) {
      const dtMatch = item.parsed.dateTime.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
      if (dtMatch) {
        const amountDateKey = `${Math.abs(item.parsed.amount!)}_${parseInt(dtMatch[1])}/${parseInt(dtMatch[2])}_${parseInt(dtMatch[3])}:${parseInt(dtMatch[4])}`;
        const existingIssuers = existingAmountDateIssuers.get(amountDateKey);
        
        if (existingIssuers) {
          const currentIssuer = item.parsed.cardIssuer ? item.parsed.cardIssuer.toLowerCase().replace(/\s+/g, '') : 'unknown';
          let isDuplicate = false;
          
          for (const storedIssuer of existingIssuers) {
            // 은행명이 둘 다 unknown이거나 서로 이름이 포함 관계면 같은 은행으로 간주
            if (storedIssuer === 'unknown' || currentIssuer === 'unknown' || 
                storedIssuer.includes(currentIssuer) || currentIssuer.includes(storedIssuer)) {
              isDuplicate = true;
              break;
            }
          }
          
          if (isDuplicate) {
            console.log(`[SmsScrapingService] 금액+시간+은행 매칭으로 제외: ${item.parsed.amount}원 ${item.parsed.merchant} (${item.parsed.dateTime})`);
            continue;
          }
        }
      }
    }

    // 이번 스캔 내 중복 → 스킵
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    result.push(item);
  }

  console.log(`[SmsScrapingService] 최종 미등록: ${result.length}건 (제외해시: ${rejectedHashes.length}개)`);

  return {
    items: result,
    debug: {
      totalSms: rawSmsList.length,
      bankSmsCount,
      parsedCount: parsedList.length,
      dedupedCount: result.length,
    },
  };
}

/**
 * RCS JSON body에서 실제 메시지 텍스트(description)를 추출
 * 
 * RCS 메시지는 다양한 JSON 구조를 가짐:
 * - {"message":{"generalPurposeCard":{"content":{"description":"실제 텍스트"}}}}
 * - {"messageHeader":"...", "description":"실제 텍스트"}
 * - 기타 중첩 구조
 */
function extractRcsDescription(jsonBody: string): string | null {
  try {
    const obj = JSON.parse(jsonBody);
    // 여러 전략으로 텍스트 추출 시도
    const desc = findTextContent(obj);
    if (desc && desc.length > 10) {
      console.log(`[SmsScrapingService] RCS JSON 추출 성공: "${desc.substring(0, 60)}..."`);
      return desc;
    }
    console.log(`[SmsScrapingService] RCS JSON 추출 실패, 원문 유지`);
    return null;
  } catch {
    return null;
  }
}

/**
 * RCS JSON에서 실제 메시지 텍스트를 재귀적으로 찾기
 * 다양한 구조 지원:
 * - {"message":{"generalPurposeCard":{"content":{"description":"텍스트"}}}}
 * - {"layout":{"children":[{"widget":"TextView","text":"거래 텍스트"}]}}
 * - {"messageHeader":"...", "description":"텍스트"}
 */
function findTextContent(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;

  // 1. description 필드 (가장 일반적)
  if (typeof obj.description === 'string' && obj.description.length > 10) {
    return obj.description.replace(/\\n/g, '\n');
  }

  // 2. TextView의 text 필드 (open_rich_card 구조) - 20자 이상만
  if (obj.widget === 'TextView' && typeof obj.text === 'string' && obj.text.length > 20) {
    return obj.text.replace(/\\n/g, '\n');
  }

  // 3. text 필드 (일반) - 30자 이상이고 금액 패턴 포함
  if (typeof obj.text === 'string' && obj.text.length > 30 && /\d+원/.test(obj.text)) {
    return obj.text.replace(/\\n/g, '\n');
  }

  // 4. messageBody 필드
  if (typeof obj.messageBody === 'string' && obj.messageBody.length > 10) {
    return obj.messageBody.replace(/\\n/g, '\n');
  }

  // 5. 배열 재귀 탐색
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findTextContent(item);
      if (found) return found;
    }
    return null;
  }

  // 6. 객체의 모든 값을 재귀 탐색
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      const found = findTextContent(value);
      if (found) return found;
    }
  }

  return null;
}
