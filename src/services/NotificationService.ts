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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    const json = await AsyncStorage.getItem(STORAGE_KEY);
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
    const archiveJson = await AsyncStorage.getItem(ARCHIVE_KEY);
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

    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
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
  await AsyncStorage.setItem(COUPLE_BANKS_KEY, JSON.stringify(banks));
}

/**
 * AsyncStorage에서 공동 통장 은행 패키지명 목록을 읽어옵니다.
 * headless task에서 알림 수신 시 공동 여부 판별에 사용합니다.
 */
export async function getCoupleAccountBanks(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(COUPLE_BANKS_KEY);
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
  const notifHash = quickHash(packageName + ':' + rawText);
  if (recentNotificationHashes.has(notifHash)) {
    return; // 이미 이 프로세스에서 처리한 알림
  }
  recentNotificationHashes.add(notifHash);
  setTimeout(() => recentNotificationHashes.delete(notifHash), HASH_EXPIRY_MS);

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
  const learnedMapping = parsed.merchant ? getLearnedMapping(parsed.merchant) : null;
  const suggestedCategoryName = parsed.merchant
    ? autoMapCategory(parsed.merchant)
    : null;

  let suggestedCategoryObj: Category | undefined;
  if (learnedMapping && suggestedCategoryName) {
    // 사용자가 학습시킨 카테고리 → 학습 데이터에서 id/group 가져옴
    suggestedCategoryObj = {
      id: learnedMapping.categoryId,
      name: learnedMapping.categoryName,
      icon: 'pricetag-outline',
      color: '#6C5CE7',
      type: 'expense',
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
      
      // 둘 다 dateTime이 있는 경우 → 직접 비교
      if (t1 && t2) {
        if (t1 === t2) {
          duplicateIndex = i;
          break;
        }
        continue; // 시간이 다르면 다른 거래
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
        const receivedTimeStr = `${mm}/${dd} ${hh}:${min}`;
        
        if (knownTime === receivedTimeStr) {
          duplicateIndex = i;
          break;
        }
        // 1분 차이도 허용 (알림 지연 감안)
        const fallbackDate2 = new Date(fallbackDate.getTime() - 60000);
        const mm2 = String(fallbackDate2.getMonth() + 1).padStart(2, '0');
        const dd2 = String(fallbackDate2.getDate()).padStart(2, '0');
        const hh2 = String(fallbackDate2.getHours()).padStart(2, '0');
        const min2 = String(fallbackDate2.getMinutes()).padStart(2, '0');
        const receivedTimeStr2 = `${mm2}/${dd2} ${hh2}:${min2}`;
        if (knownTime === receivedTimeStr2) {
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

    // issuer가 다르고 다른 앱에서 온 경우 → 시간 비교로 같은 거래인지 판단
    if (parsed.packageName && p.parsed.packageName && parsed.packageName !== p.parsed.packageName) {
      const t1 = (parsed.dateTime || '').trim();
      const t2 = (p.parsed.dateTime || '').trim();
      // 둘 다 dateTime이 있고 같으면 → 중복
      if (t1 && t2 && t1 === t2) {
        duplicateIndex = i;
        break;
      }
      // 한쪽만 dateTime이 있는 경우 → receivedAt으로 비교
      if ((t1 || t2) && !(t1 && t2)) {
        const knownTime = t1 || t2;
        const fallbackDate = t1 ? new Date(p.receivedAt) : new Date();
        const mm = String(fallbackDate.getMonth() + 1).padStart(2, '0');
        const dd = String(fallbackDate.getDate()).padStart(2, '0');
        const hh = String(fallbackDate.getHours()).padStart(2, '0');
        const min = String(fallbackDate.getMinutes()).padStart(2, '0');
        const receivedTimeStr = `${mm}/${dd} ${hh}:${min}`;
        if (knownTime === receivedTimeStr) {
          duplicateIndex = i;
          break;
        }
        // 1분 차이 허용
        const fb2 = new Date(fallbackDate.getTime() - 60000);
        const rts2 = `${String(fb2.getMonth()+1).padStart(2,'0')}/${String(fb2.getDate()).padStart(2,'0')} ${String(fb2.getHours()).padStart(2,'0')}:${String(fb2.getMinutes()).padStart(2,'0')}`;
        if (knownTime === rts2) {
          duplicateIndex = i;
          break;
        }
      }
      // dateTime이 다르거나 매칭 안 되면 별개 거래
      continue;
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
  await AsyncStorage.removeItem(STORAGE_KEY);
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
    const json = await AsyncStorage.getItem(ARCHIVE_KEY);
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
      await AsyncStorage.setItem(REJECTED_HASHES_KEY, JSON.stringify(trimmed));
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
    const json = await AsyncStorage.getItem(REJECTED_HASHES_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}
