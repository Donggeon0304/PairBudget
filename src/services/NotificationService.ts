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

import { PendingTransaction, Category, DEFAULT_CATEGORIES } from '../types';
import {
  parseNotification,
  isBankNotification,
  isSmsApp,
  isBankSms,
  BANK_PACKAGES,
  KAKAO_FINANCE_CHANNELS,
} from './BankNotificationParser';
import { autoMapCategory, initCategoryMapper, learnCategoryMapping, getLearnedMapping } from './CategoryAutoMapper';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = '@PairBudget:pendingTransactions';
const COUPLE_BANKS_KEY = '@PairBudget:coupleBanks';
const REJECTED_HASHES_KEY = '@PairBudget:rejectedTxHashes';

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
 * Read the pending transactions array from AsyncStorage.
 */
async function readPending(): Promise<PendingTransaction[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    return json ? (JSON.parse(json) as PendingTransaction[]) : [];
  } catch {
    return [];
  }
}

/**
 * Write the pending transactions array to AsyncStorage.
 */
async function writePending(items: PendingTransaction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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

/** 인메모리 중복 방지 (프로세스 내 경쟁 조건 해결) */
const recentNotificationHashes = new Set<string>();
const HASH_EXPIRY_MS = 3 * 60 * 1000; // 3분

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

  // 🟢 알림 중복 방지 (Deduplication) 로직
  const existing = await readPending();
  let duplicateIndex = -1;
  for (let i = 0; i < existing.length; i++) {
    const p = existing[i];
    const timeDiffMs = new Date().getTime() - new Date(p.receivedAt).getTime();
    if (timeDiffMs >= 15 * 60 * 1000) continue; // 15분 이상 차이나면 다른 거래

    // 같은 금액 + 같은 입출금 타입이면 중복 후보
    if (p.parsed.amount !== parsed.amount) continue;
    if (p.parsed.incomeOrExpense !== parsed.incomeOrExpense) continue;

    // 1. [피드백 반영] 같은 은행(카드사) + 같은 금액 + 같은 시간(15분 내)이면 가맹점이 다르게 파싱돼도 무조건 중복 1건으로!
    const issuer1 = (parsed.cardIssuer || 'unknown').toLowerCase().replace(/\s+/g, '');
    const issuer2 = (p.parsed.cardIssuer || 'unknown').toLowerCase().replace(/\s+/g, '');
    
    const isSameIssuer = issuer1 === 'unknown' || issuer2 === 'unknown' || 
                         issuer1.includes(issuer2) || issuer2.includes(issuer1);
                         
    if (isSameIssuer) {
      // 거래 시간(알림 원문에서 파싱된 시간)이 둘 다 있고 서로 다르면 → 별개 거래
      const t1 = (parsed.dateTime || '').trim();
      const t2 = (p.parsed.dateTime || '').trim();
      if (t1 && t2 && t1 !== t2) {
        continue; // 시간이 다르면 다른 거래
      }
      // 시간이 같거나 파싱 못 했으면 → 중복으로 처리
      duplicateIndex = i;
      break;
    }

    // 2. 은행을 특정하지 못했을 때 (양쪽 다 확실히 다른 은행이면 위에서 isSameIssuer=false가 됨)
    // 이 경우 가맹점명이 서로 일치/포함 관계이면 중복으로 판별
    const m1 = (parsed.merchant || '').replace(/\s+/g, '');
    const m2 = (p.parsed.merchant || '').replace(/\s+/g, '');
    
    // 가맹점명이 양쪽 다 있고 서로 확실히 다르면 -> 스킵
    if (m1 && m2 && m1 !== m2 && !m1.includes(m2) && !m2.includes(m1)) {
      continue;
    }

    // 가맹점명이 포함 관계이거나, 둘 중 하나가 누락되었는데 같은 앱에서 발생한 알림이면 중복
    if ((m1 && m2 && (m1.includes(m2) || m2.includes(m1))) || 
        (!m1 || !m2)) {
      duplicateIndex = i;
      break;
    }
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
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// Re-export bank packages for convenience
export { BANK_PACKAGES };

// Re-export category learning functions
export { learnCategoryMapping, getLearnedMapping, initCategoryMapper };

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
