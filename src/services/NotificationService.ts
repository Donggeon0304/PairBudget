/**
 * NotificationService.ts
 *
 * Android NotificationListenerService bridge for PairBudget.
 * Listens for bank/card push notifications, parses them, and queues
 * pending transactions in AsyncStorage for the user to review & confirm.
 *
 * Depends on:
 *   - react-native-android-notification-listener
 *   - @react-native-async-storage/async-storage
 */

import RNAndroidNotificationListener, {
  RNAndroidNotificationListenerHeadlessJsName,
} from 'react-native-android-notification-listener';
import { SecureStorage } from './SecureStorage';
import { AppRegistry } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';

import { PendingTransaction, Category, DEFAULT_CATEGORIES, ParsedNotification } from '../types';
import {
  parseNotification,
  isBankNotification,
  isSmsApp,
  isBankSms,
  BANK_PACKAGES,
  KAKAO_FINANCE_CHANNELS,
  generateTransactionHash,
} from './BankNotificationParser';
import { autoMapCategory, initCategoryMapper, learnCategoryMapping, getLearnedMapping } from './CategoryAutoMapper';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = '@PairBudget:pendingTransactions';
const COUPLE_BANKS_KEY = '@PairBudget:coupleBanks';
const REJECTED_HASHES_KEY = '@PairBudget:rejectedTxHashes';
const ARCHIVE_KEY = '@PairBudget:notificationArchive';

export interface ArchivedNotification {
  id: string;
  parsed: ParsedNotification;  // 파싱된 거래 정보
  receivedAt: string;         // ISO string
  packageName: string;        // 원본 앱 패키지명
  rawText: string;            // 원문 텍스트
  txHash: string;             // 거래 해시 (dedup용)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a simple unique ID (good enough for local pending queue).
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 인메모리 캐시: 동시 알림 처리 시 AsyncStorage I/O 경쟁 상태 방지
 * 뮤텍스와 결합하여 readPending → dedup → writePending 사이클의 일관성 보장
 */
let pendingCache: PendingTransaction[] | null = null;

/**
 * Read the pending transactions array.
 * 인메모리 캐시가 있으면 즉시 반환 (AsyncStorage I/O 없음),
 * 없으면 AsyncStorage에서 로드 후 캐시.
 */
async function readPending(): Promise<PendingTransaction[]> {
  if (pendingCache !== null) {
    return [...pendingCache]; // 얕은 복사: 원본 캐시 보호
  }
  try {
    const json = await SecureStorage.getItem(STORAGE_KEY);
    pendingCache = json ? (JSON.parse(json) as PendingTransaction[]) : [];
    return [...pendingCache];
  } catch (e) {
    console.error('[PairBudget] readPending AsyncStorage 실패:', e);
    return pendingCache ? [...pendingCache] : [];
  }
}

/**
 * Write the pending transactions array to AsyncStorage.
 * 인메모리 캐시도 동시에 갱신.
 */
async function writePending(items: PendingTransaction[]): Promise<void> {
  pendingCache = items; // 캐시 즉시 갱신 (다음 readPending에서 사용)
  try {
    await SecureStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('[PairBudget] writePending AsyncStorage 실패:', e);
    // 캐시는 이미 갱신됨 → 다음 dedup에서는 정상 동작
    // AsyncStorage 저장은 실패했지만 앱 재시작 전까지는 캐시로 동작
  }
}

/**
 * 파싱된 알림을 아카이브에 저장합니다.
 * 동일한 txHash가 있으면 중복으로 간주하고 무시합니다.
 * 오래된 항목(30일 이상)은 정리하고, 최대 1000개만 유지합니다.
 */
async function saveToArchive(
  parsed: ParsedNotification,
  rawText: string,
  packageName: string
): Promise<void> {
  try {
    const txHash = generateTransactionHash(
      parsed.amount || 0,
      parsed.merchant,
      parsed.dateTime,
      parsed.cardIssuer,
      new Date(),
    );
    const archiveJson = await SecureStorage.getItem(ARCHIVE_KEY);
    let archive: ArchivedNotification[] = archiveJson ? JSON.parse(archiveJson) : [];

    // 중복 체크
    if (archive.some(item => item.txHash === txHash)) {
      return;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 오래된 항목 제거
    archive = archive.filter(item => new Date(item.receivedAt) >= thirtyDaysAgo);

    const newArchiveItem: ArchivedNotification = {
      id: generateId(),
      parsed,
      receivedAt: now.toISOString(),
      packageName,
      rawText,
      txHash,
    };

    archive.push(newArchiveItem);

    // 최대 1000개 유지
    if (archive.length > 1000) {
      archive = archive.slice(archive.length - 1000);
    }

    await SecureStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
  } catch (e) {
    console.error('[PairBudget] 아카이브 저장 실패:', e);
  }
}

// ---------------------------------------------------------------------------
// 공동 은행 목록 캐싱 (AsyncStorage)
// ---------------------------------------------------------------------------

/**
 * 공동 통장으로 지정된 은행 패키지명 목록을 AsyncStorage에 저장합니다.
 * SettingsScreen에서 은행 등록 시 호출하세요.
 */
export async function saveCoupleAccountBanks(banks: string[]): Promise<void> {
  await SecureStorage.setItem(COUPLE_BANKS_KEY, JSON.stringify(banks));
}

/**
 * AsyncStorage에서 공동 통장 은행 패키지명 목록을 읽어옵니다.
 * headless task에서 알림 수신 시 공동 여부 판별에 사용합니다.
 */
export async function getCoupleAccountBanks(): Promise<string[]> {
  try {
    const json = await SecureStorage.getItem(COUPLE_BANKS_KEY);
    return json ? (JSON.parse(json) as string[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Headless task handler (runs even when app is in background)
// ---------------------------------------------------------------------------

/** AsyncStorage 읽기-수정-쓰기 경쟁 조건 방지 뮤텍스 */
let pendingMutex: Promise<void> = Promise.resolve();
function acquirePendingLock(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const newLock = new Promise<void>(resolve => { release = resolve; });
  const waitForPrev = pendingMutex;
  pendingMutex = newLock;
  return { promise: waitForPrev, release };
}

/** 인메모리 중복 방지 (Android가 같은 알림을 연속 발사하는 것 방지) */
const recentNotificationHashes = new Set<string>();
const HASH_EXPIRY_MS = 5 * 1000; // 5초 (같은 알림 연속 발사만 방지, 정상 거래는 허용)

function quickHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Called by the native NotificationListenerService whenever a new
 * notification is posted on the device.
 */
async function headlessNotificationHandler(rawNotification: any): Promise<void> {
  try {
  // 라이브러리가 { notification: 'JSON string' } 형태로 넘겨줌
  let notification: any;
  try {
    const raw = rawNotification?.notification || rawNotification;
    notification = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return;
  }

  const packageName = notification.app;

  // 우리 앱 자체 알림은 무시 (자기 알림을 다시 파싱하는 루프 방지)
  if (packageName?.startsWith('com.pairbudget')) return;

  // 학습된 카테고리 매핑 로드
  await initCategoryMapper();

  let rawText = '';
  const bigText = notification.bigText?.trim();
  const text = notification.text?.trim();
  const title = notification.title?.trim();

  if (bigText) {
    rawText = bigText;
  } else if (text) {
    rawText = text;
  }

  // 카카오톡 필터링: 알림 발신자(title)가 금융 채널 화이트리스트에 없으면 무시
  if (packageName === 'com.kakao.talk') {
    if (!title || !KAKAO_FINANCE_CHANNELS.some(c => title.includes(c))) {
      return;
    }
  }

  if (title && rawText && !rawText.includes(title)) {
    const skipTitles = ['알림', '거래알림', '거래 알림', '카카오뱅크', 'NH농협', 'KB국민', '토스', '신한'];
    if (!skipTitles.some(s => title === s || title.startsWith(s))) {
      rawText = title + ' ' + rawText;
    }
  }

  if (!rawText) rawText = title || '';
  if (!rawText.trim()) return;

  // 🔒 인메모리 즉시 중복 체크 (AsyncStorage 경쟁 조건 방지)
  // 안드로이드 NotificationListener가 같은 알림을 밀리초 단위로 중복 콜백하는 것만 방지
  // 2초로 짧게 설정: 같은 앱에서 같은 금액 거래가 빠르게 연속될 수 있음 (네이버페이 충전 등)
  const notifHash = quickHash(packageName + ':' + rawText);
  if (recentNotificationHashes.has(notifHash)) {
    return; // 2초 내 완전 동일 알림 = 시스템 중복 콜백
  }
  recentNotificationHashes.add(notifHash);
  setTimeout(() => recentNotificationHashes.delete(notifHash), 2000); // 2초

  const isKnownApp = isBankNotification(packageName);
  const looksLikeTransaction = isBankSms(rawText);

  // 은행/카드/문자 앱이 아니더라도 내용이 거래내역 같으면 허용 (미확인 은행 앱 등)
  if (!isKnownApp && !looksLikeTransaction) {
    return;
  }

  // 문자/SMS 앱인 경우, 내용이 거래내역 같을 때만 허용
  if (isSmsApp(packageName) && !looksLikeTransaction) {
    return;
  }

  // Parse the notification
  const parsed = parseNotification(rawText, packageName);

  // Only queue if we could extract a meaningful amount
  if (parsed.amount === null || parsed.amount <= 0) {
    return;
  }

  console.log('[PairBudget] 🔔 알림 원문:', JSON.stringify({ title, text: text?.substring(0, 60), bigText: bigText?.substring(0, 60), pkg: packageName }));
  console.log('[PairBudget] 📝 rawText:', rawText.substring(0, 80));
  console.log('[PairBudget] 거래 감지:', parsed.incomeOrExpense, parsed.amount, 'merchant:', parsed.merchant?.substring(0, 30));

  // Auto-suggest a category (학습된 매핑 우선)
  const txType = parsed.incomeOrExpense === 'income' ? 'income' : 'expense';
  const learnedMapping = parsed.merchant ? getLearnedMapping(parsed.merchant, txType) : null;
  const suggestedCategoryName = parsed.merchant
    ? autoMapCategory(parsed.merchant)
    : null;

  let suggestedCategoryObj: Category | undefined;
  if (learnedMapping) {
    // 사용자가 학습시킨 카테고리 → 학습 데이터에서 id/group 가져옴
    suggestedCategoryObj = {
      id: learnedMapping.categoryId,
      name: learnedMapping.categoryName,
      icon: 'pricetag-outline',
      color: '#6C5CE7',
      type: parsed.incomeOrExpense === 'income' ? 'income' : 'expense',
      group: learnedMapping.group,
      order: 999,
      isDefault: false,
    };
  } else if (suggestedCategoryName) {
    const defaultCategory = DEFAULT_CATEGORIES.find(c => c.name === suggestedCategoryName);
    suggestedCategoryObj = defaultCategory
      ? { ...defaultCategory, id: defaultCategory.name }
      : undefined;
  }

  // 공동 통장 여부 자동 판별
  const coupleBanks = await getCoupleAccountBanks();
  const isCouple = coupleBanks.includes(packageName);

  // 이미 승인(등록)된 거래인지 확인 (등록 후 다른 앱에서 같은 거래 알림이 들어오는 경우 방지)
  if (parsed.amount && await isAlreadyApproved(parsed.amount, parsed.cardIssuer || '', parsed.dateTime || '')) {
    console.log('[PairBudget] ⏭️ 이미 등록된 거래 감지 → 스킵:', parsed.amount, parsed.cardIssuer, parsed.dateTime);
    return;
  }

  // 아카이브에 원본 알림 저장 (뮤텍스 획득 전 독립적으로 수행)
  await saveToArchive(parsed, rawText, packageName);

  // 🔒 뮤텍스: 동시 알림 처리 시 AsyncStorage 덮어쓰기 방지
  const lock = acquirePendingLock();
  await lock.promise;
  try {

  // 🟢 알림 중복 방지 (Deduplication) 로직
  const existing = await readPending();
  console.log(`[PairBudget] 🔍 dedup 시작: pending=${existing.length}건, 새알림=${parsed.amount}원 ${parsed.incomeOrExpense} issuer=${parsed.cardIssuer} dt=${parsed.dateTime} pkg=${packageName}`);
  let duplicateIndex = -1;
  for (let i = 0; i < existing.length; i++) {
    const p = existing[i];
    const timeDiffMs = new Date().getTime() - new Date(p.receivedAt).getTime();

    // 거래시간(dateTime)이 동일하면 수신시각 차이 무관하게 중복 후보 유지
    // (같은 거래가 앱 알림 + SMS로 시차를 두고 올 수 있음)
    const newDt = (parsed.dateTime || '').trim();
    const existDt = (p.parsed.dateTime || '').trim();
    const hasSameDateTime = newDt !== '' && existDt !== '' && newDt === existDt;

    if (!hasSameDateTime && timeDiffMs >= 15 * 60 * 1000) continue; // 거래시간 다르고 15분 이상이면 다른 거래

    // 같은 금액 + 같은 입출금 타입이면 중복 후보
    if (p.parsed.amount !== parsed.amount) continue;
    if (p.parsed.incomeOrExpense !== parsed.incomeOrExpense) continue;

    // 🟢 같은 앱(packageName)에서 온 알림이면 → 별개 거래 (중복 아님)
    // quickHash(L259)가 완전 동일한 알림을 이미 잡으므로, 여기까지 온 건 rawText가 다른 = 다른 거래
    if (packageName && p.parsed.packageName && packageName === p.parsed.packageName) {
      continue;
    }

    // 1. [피드백 반영] 같은 은행(카드사) + 같은 금액 + 같은 시간(15분 내)이면 가맹점이 다르게 파싱돼도 무조건 중복 1건으로!
    const issuer1 = (parsed.cardIssuer || '').toLowerCase().replace(/\s+/g, '');
    const issuer2 = (p.parsed.cardIssuer || '').toLowerCase().replace(/\s+/g, '');
    
    // 둘 다 issuer가 있고 서로 다르면 → 확실히 다른 은행
    const bothHaveIssuer = issuer1 !== '' && issuer2 !== '';
    const isDefinitelyDifferentIssuer = bothHaveIssuer && 
                         !issuer1.includes(issuer2) && !issuer2.includes(issuer1);
    // 같은 은행이거나, 한쪽이 unknown이면 → 시간 기반 중복 체크 진행
    const isSameOrUnknownIssuer = !isDefinitelyDifferentIssuer;
                         
    if (isSameOrUnknownIssuer) {
      // 거래 시간(알림 원문에서 파싱된 시간) 비교
      const t1 = (parsed.dateTime || '').trim();
      const t2 = (p.parsed.dateTime || '').trim();

      // "MM/DD HH:MM" → 총 분 수로 변환 (크로스앱 ±10분 비교용)
      const toMin = (dt: string): number | null => {
        const m = dt.match(/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
        if (!m) return null;
        return parseInt(m[1], 10) * 43200 + parseInt(m[2], 10) * 1440 + parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
      };
      
      // 둘 다 dateTime이 있는 경우
      if (t1 && t2) {
        if (t1 === t2) {
          duplicateIndex = i;
          break;
        }
        // 정확히 같지 않더라도 ±10분 이내면 중복 (SMS vs 앱 알림 시간차)
        const m1 = toMin(t1);
        const m2 = toMin(t2);
        if (m1 !== null && m2 !== null && Math.abs(m1 - m2) <= 10) {
          duplicateIndex = i;
          break;
        }
        continue; // 10분 이상 차이나면 확실히 다른 거래
      }
      
      // 한쪽만 dateTime이 있는 경우 → receivedAt을 MM/DD HH:MM 형식으로 변환해서 비교
      if (t1 || t2) {
        const knownTime = t1 || t2;
        // dateTime이 없는 쪽의 receivedAt을 같은 형식으로 변환
        const fallbackDate = t1 ? new Date(p.receivedAt) : new Date();
        const mm = String(fallbackDate.getMonth() + 1).padStart(2, '0');
        const dd = String(fallbackDate.getDate()).padStart(2, '0');
        const hh = String(fallbackDate.getHours()).padStart(2, '0');
        const min = String(fallbackDate.getMinutes()).padStart(2, '0');
        const fallbackTimeStr = `${mm}/${dd} ${hh}:${min}`;
        
        // ±10분 이내면 중복
        const knownMin = toMin(knownTime);
        const fallbackMin = toMin(fallbackTimeStr);
        if (knownMin !== null && fallbackMin !== null && Math.abs(knownMin - fallbackMin) <= 10) {
          duplicateIndex = i;
          break;
        }
        continue;
      }
      
      // 둘 다 dateTime 파싱 못 한 경우 → receivedAt 차이로 판별 (2분 이상이면 별도 거래)
      const receivedDiffMs = Math.abs(new Date().getTime() - new Date(p.receivedAt).getTime());
      if (receivedDiffMs > 120 * 1000) {
        continue;
      }
      duplicateIndex = i;
      break;
    }

    // issuer가 다르고 다른 앱에서 온 같은 금액 → ±10분 이내면 중복 (같은 결제의 다른 알림)
    if (parsed.packageName && p.parsed.packageName && parsed.packageName !== p.parsed.packageName) {
      const t1 = (parsed.dateTime || '').trim();
      const t2 = (p.parsed.dateTime || '').trim();

      // "MM/DD HH:MM" → 총 분 수로 변환
      const toMinutes = (dt: string): number | null => {
        const m = dt.match(/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
        if (!m) return null;
        return parseInt(m[1], 10) * 43200 + parseInt(m[2], 10) * 1440 + parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
      };

      // 둘 다 dateTime이 있는 경우 → ±10분 이내면 중복
      if (t1 && t2) {
        const m1 = toMinutes(t1);
        const m2 = toMinutes(t2);
        if (m1 !== null && m2 !== null && Math.abs(m1 - m2) <= 10) {
          duplicateIndex = i;
          break;
        }
        continue;
      }

      // 한쪽만 dateTime이 있는 경우 → receivedAt을 변환해서 ±10분 비교
      if (t1 || t2) {
        const knownTime = t1 || t2;
        const fallbackDate = t1 ? new Date(p.receivedAt) : new Date();
        const mm = String(fallbackDate.getMonth() + 1).padStart(2, '0');
        const dd = String(fallbackDate.getDate()).padStart(2, '0');
        const hh = String(fallbackDate.getHours()).padStart(2, '0');
        const mn = String(fallbackDate.getMinutes()).padStart(2, '0');
        const knownMin = toMinutes(knownTime);
        const fallbackMin = toMinutes(`${mm}/${dd} ${hh}:${mn}`);
        if (knownMin !== null && fallbackMin !== null && Math.abs(knownMin - fallbackMin) <= 10) {
          duplicateIndex = i;
          break;
        }
        continue;
      }

      // 둘 다 dateTime이 없으면 → receivedAt 15분 이내(L343 통과)이므로 중복 처리
      duplicateIndex = i;
      break;
    }

    // 2. 같은 앱에서 온 알림이고, 가맹점명이 양쪽 다 있고 서로 포함 관계이면 중복
    const m1 = (parsed.merchant || '').replace(/\s+/g, '');
    const m2 = (p.parsed.merchant || '').replace(/\s+/g, '');
    
    // 가맹점명이 양쪽 다 있고 서로 확실히 다르면 -> 스킵
    if (m1 && m2 && m1 !== m2 && !m1.includes(m2) && !m2.includes(m1)) {
      continue;
    }

    // 가맹점명이 포함 관계이면 중복
    if (m1 && m2 && (m1.includes(m2) || m2.includes(m1))) {
      duplicateIndex = i;
      break;
    }
    // 가맹점명이 한쪽만 없으면 → 중복 판정하지 않음 (별개 거래로 취급)
  }

  if (duplicateIndex >= 0) {
    // 중복이지만, 새 알림의 가맹점명이 더 길면 기존 것을 업데이트
    const existingMerchant = existing[duplicateIndex].parsed.merchant || '';
    const newMerchant = parsed.merchant || '';
    if (newMerchant.length > existingMerchant.length) {
      existing[duplicateIndex].parsed.merchant = newMerchant;
      // raw도 더 긴 것으로 갱신 (원문 접기에 표시됨)
      if (parsed.raw.length > existing[duplicateIndex].parsed.raw.length) {
        existing[duplicateIndex].parsed.raw = parsed.raw;
      }
      // suggestedCategory도 새 알림의 것이 더 정확할 수 있으므로 갱신
      if (suggestedCategoryObj && !existing[duplicateIndex].suggestedCategory) {
        existing[duplicateIndex].suggestedCategory = suggestedCategoryObj;
      }
      await writePending(existing);
      console.log('[PairBudget] 중복 알림: 더 긴 가맹점명으로 갱신:', newMerchant);

      // 상단 알림도 갱신 (더 상세한 정보로 업데이트)
      try {
        const channelId = await notifee.createChannel({
          id: 'pairbudget_transactions',
          name: '거래 알림',
          importance: AndroidImportance.HIGH,
        });
        const typeLabel = parsed.incomeOrExpense === 'income' ? '입금' : '출금';
        const totalPendingCount = existing.length;
        const titleText = totalPendingCount > 1
          ? `${newMerchant || typeLabel} 외 ${totalPendingCount - 1}건`
          : `${newMerchant || typeLabel}`;
        const formattedAmount = parsed.amount ? parsed.amount.toLocaleString() + '원' : '';
        const bodyText = parsed.cardIssuer
          ? `${formattedAmount} (${parsed.cardIssuer})`
          : formattedAmount;

        await notifee.displayNotification({
          id: 'pending_transactions_summary',
          title: titleText,
          body: bodyText,
          android: {
            channelId,
            smallIcon: 'ic_launcher',
            pressAction: { id: 'default' },
          },
        });
      } catch (e) {
        console.log('[PairBudget] 알림 갱신 실패:', e);
      }
    } else {
      console.log('[PairBudget] 중복 알림 방지: 최근 15분 내에 동일 거래 감지. 스킵.');
    }
    return;
  }

  const pending: PendingTransaction = {
    id: generateId(),
    parsed: parsed,
    suggestedCategory: suggestedCategoryObj,
    receivedAt: new Date(),
    status: 'pending',
    isCouple,
  };

  // Append to storage
  existing.push(pending);
  await writePending(existing);

  // 로컬 알림 즉시 발송
  // 더 상세한 알림이 뒤따르면 중복 감지 로직(위)에서 자동으로 알림을 갱신합니다.
  try {
    const channelId = await notifee.createChannel({
      id: 'pairbudget_transactions',
      name: '거래 알림',
      importance: AndroidImportance.HIGH,
    });

    const typeLabel = parsed.incomeOrExpense === 'income' ? '입금' : '출금';

    // 🟢 알림 묶어서 표시 (Grouping)
    const totalPendingCount = existing.length;
    let titleText = '';
    if (totalPendingCount > 1) {
      titleText = `${parsed.merchant || typeLabel} 외 ${totalPendingCount - 1}건`;
    } else {
      titleText = `${parsed.merchant || typeLabel}`;
    }

    const formattedAmount = parsed.amount ? parsed.amount.toLocaleString() + '원' : '';
    const bodyText = parsed.cardIssuer
      ? `${formattedAmount} (${parsed.cardIssuer})`
      : formattedAmount;

    await notifee.displayNotification({
      id: 'pending_transactions_summary', // 고정 ID를 사용해 알림이 쌓이지 않고 덮어씌워지게 함
      title: titleText,
      body: bodyText,
      android: {
        channelId,
        smallIcon: 'ic_launcher',
        pressAction: { id: 'default' },
      },
    });
  } catch (e) {
    console.log('[PairBudget] 로컬 알림 발송 실패:', e);
  }
  } finally {
    lock.release(); // 뮤텍스 해제
  }
  } catch (fatalError) {
    // 재부팅 직후 등 초기화 미완료 상태에서 크래시 방지
    console.error('[PairBudget] headless handler 치명적 오류:', fatalError);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the headless JS task that processes incoming notifications.
 * Call this once in your app's `index.js` **before** `AppRegistry.registerComponent`.
 */
export function initNotificationListener(): void {
  AppRegistry.registerHeadlessTask(
    RNAndroidNotificationListenerHeadlessJsName,
    () => headlessNotificationHandler,
  );
}

/**
 * Check whether the user has granted notification-listener permission.
 * @returns The current permission status string.
 */
export async function checkNotificationPermission(): Promise<string> {
  const status = await RNAndroidNotificationListener.getPermissionStatus();
  return status;
}

/**
 * Open the Android system settings page so the user can grant
 * notification-listener access to this app.
 */
export function requestNotificationPermission(): void {
  RNAndroidNotificationListener.requestPermission();
}

/**
 * Retrieve all pending (unprocessed) transactions queued by the
 * notification listener.
 */
export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  return readPending();
}

/**
 * Remove a single pending transaction by ID (e.g. after the user
 * confirms or dismisses it).
 */
export async function removePendingTransaction(id: string): Promise<void> {
  const items = await readPending();
  const filtered = items.filter((t) => t.id !== id);
  await writePending(filtered);
}

/**
 * Clear the entire pending transaction queue.
 */
export async function clearPendingTransactions(): Promise<void> {
  pendingCache = null; // 캐시 무효화
  await SecureStorage.removeItem(STORAGE_KEY);
}

// Re-export bank packages for convenience
export { BANK_PACKAGES };

// Re-export category learning functions
export { learnCategoryMapping, getLearnedMapping, initCategoryMapper };

/**
 * 아카이브에서 지정 기간 내 알림 조회
 * @param daysBack 며칠 전까지 조회
 */
export async function getArchivedNotifications(daysBack: number): Promise<ArchivedNotification[]> {
  try {
    const json = await SecureStorage.getItem(ARCHIVE_KEY);
    if (!json) return [];
    
    const all: ArchivedNotification[] = JSON.parse(json);
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - daysBack);
    
    return all.filter(item => new Date(item.receivedAt) >= limitDate);
  } catch (e) {
    console.error('[PairBudget] 아카이브 로드 실패:', e);
    return [];
  }
}

// saveCoupleAccountBanks, getCoupleAccountBanks는 위에서 이미 export됨

// ---------------------------------------------------------------------------
// 제외된 거래 해시 관리 (SMS 스캔 시 무시용)
// ---------------------------------------------------------------------------

/**
 * 제외된 거래의 txHash 저장
 */
export async function addRejectedHash(txHash: string): Promise<void> {
  try {
    const hashes = await getRejectedHashes();
    if (!hashes.includes(txHash)) {
      hashes.push(txHash);
      // 최대 500개만 유지 (오래된 것 자동 제거)
      const trimmed = hashes.slice(-500);
      await SecureStorage.setItem(REJECTED_HASHES_KEY, JSON.stringify(trimmed));
    }
  } catch (e) {
    console.error('[NotificationService] addRejectedHash error:', e);
  }
}

/**
 * 제외된 거래 해시 목록 조회
 */
export async function getRejectedHashes(): Promise<string[]> {
  try {
    const json = await SecureStorage.getItem(REJECTED_HASHES_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 승인된 거래 해시 관리 (등록 후 다른 앱 알림 중복 방지)
// ---------------------------------------------------------------------------
const APPROVED_HASHES_KEY = '@PairBudget:approvedTxHashes';

/**
 * 승인된 거래의 금액+은행+시간 정보를 저장 (등록 후 같은 거래 재감지 방지)
 */
export async function addApprovedTransaction(amount: number, issuer: string, dateTime: string): Promise<void> {
  try {
    const json = await SecureStorage.getItem(APPROVED_HASHES_KEY);
    const list: Array<{ amount: number; issuer: string; dateTime: string; approvedAt: number }> = json ? JSON.parse(json) : [];
    list.push({ amount, issuer: (issuer || '').toLowerCase().replace(/\s+/g, ''), dateTime: (dateTime || '').trim(), approvedAt: Date.now() });
    // 최대 200개, 7일 이내만 유지
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trimmed = list.filter(l => l.approvedAt > weekAgo).slice(-200);
    await SecureStorage.setItem(APPROVED_HASHES_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[NotificationService] addApprovedTransaction error:', e);
  }
}

/**
 * 승인된 거래 목록에서 같은 거래가 있는지 확인
 */
export async function isAlreadyApproved(amount: number, issuer: string, dateTime: string): Promise<boolean> {
  try {
    const json = await SecureStorage.getItem(APPROVED_HASHES_KEY);
    if (!json) return false;
    const list: Array<{ amount: number; issuer: string; dateTime: string; approvedAt: number }> = JSON.parse(json);
    const normalizedIssuer = (issuer || '').toLowerCase().replace(/\s+/g, '');
    const normalizedDateTime = (dateTime || '').trim();

    // "MM/DD HH:MM" → 총 분 수로 변환
    const toMin = (dt: string): number | null => {
      const m = dt.match(/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 43200 + parseInt(m[2], 10) * 1440 + parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    };

    return list.some(approved => {
      if (approved.amount !== amount) return false;
      // 같은 은행?
      if (normalizedIssuer && approved.issuer && !normalizedIssuer.includes(approved.issuer) && !approved.issuer.includes(normalizedIssuer)) return false;
      // 시간 ±10분?
      if (normalizedDateTime && approved.dateTime) {
        const m1 = toMin(normalizedDateTime);
        const m2 = toMin(approved.dateTime);
        if (m1 !== null && m2 !== null && Math.abs(m1 - m2) <= 10) return true;
        if (normalizedDateTime === approved.dateTime) return true;
        return false;
      }
      // 시간 정보 없으면 7일 이내 같은 금액+은행으로 판단하지 않음
      return false;
    });
  } catch {
    return false;
  }
}
