/**
 * SecureStorage — 암호화된 로컬 저장소 래퍼
 *
 * AsyncStorage(평문) → EncryptedStorage(AES-256 암호화)로 전환.
 * 앱 시작 시 migrateToEncryptedStorage()를 호출하여
 * 기존 데이터를 안전하게 이전합니다.
 */

import EncryptedStorage from 'react-native-encrypted-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MIGRATION_DONE_KEY = '@PairBudget:encrypted_migration_done';

// 마이그레이션 대상 키 목록
const MIGRATION_KEYS = [
  '@PairBudget:pendingTransactions',
  '@PairBudget:notificationArchive',
  '@PairBudget:approvedTxHashes',
  '@PairBudget:rejectedTxHashes',
  '@PairBudget:coupleBanks',
  '@PairBudget:learnedCategories',
  '@PairBudget:fiscalCycle',
  '@PairBudget:notifPermAsked',
  'pending_notification_nav',
];

/**
 * AsyncStorage → EncryptedStorage 마이그레이션
 * 앱 시작 시 한 번만 실행됨. 이미 완료된 경우 즉시 반환.
 */
export async function migrateToEncryptedStorage(): Promise<void> {
  try {
    // 이미 마이그레이션 완료 확인 (EncryptedStorage에서 확인)
    const done = await EncryptedStorage.getItem(MIGRATION_DONE_KEY);
    if (done === 'true') {
      return;
    }

    console.log('[SecureStorage] Starting migration...');
    let migratedCount = 0;

    for (const key of MIGRATION_KEYS) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value !== null) {
          await EncryptedStorage.setItem(key, value);
          await AsyncStorage.removeItem(key);
          migratedCount++;
        }
      } catch (e) {
        console.warn(`[SecureStorage] Failed to migrate key: ${key}`, e);
        // 개별 키 실패해도 나머지 계속 진행
      }
    }

    // 마이그레이션 완료 표시
    await EncryptedStorage.setItem(MIGRATION_DONE_KEY, 'true');
    console.log(`[SecureStorage] Migration completed: ${migratedCount} keys migrated`);
  } catch (e) {
    console.warn('[SecureStorage] Migration failed:', e);
    // 마이그레이션 실패해도 앱은 정상 작동 (다음 시작 시 재시도)
  }
}

/**
 * EncryptedStorage 래핑 — AsyncStorage와 동일한 인터페이스
 */
export const SecureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await EncryptedStorage.getItem(key);
      return value ?? null;
    } catch (e) {
      console.warn(`[SecureStorage] getItem failed for key: ${key}`, e);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await EncryptedStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[SecureStorage] setItem failed for key: ${key}`, e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await EncryptedStorage.removeItem(key);
    } catch (e) {
      console.warn(`[SecureStorage] removeItem failed for key: ${key}`, e);
    }
  },
};

// ── 고정비 제외 카테고리 관리 ──

const FIXED_COST_EXCLUDE_KEY = '@PairBudget:fixedCostExcludeCategories';

export interface ExcludeCategorySetting {
  group: string;
  name?: string;
}

const DEFAULT_EXCLUDE: ExcludeCategorySetting[] = [{ group: '식비' }];

export async function getFixedCostExcludeCategories(): Promise<ExcludeCategorySetting[]> {
  const raw = await SecureStorage.getItem(FIXED_COST_EXCLUDE_KEY);
  if (!raw) return DEFAULT_EXCLUDE;
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_EXCLUDE;
  }
}

export async function setFixedCostExcludeCategories(categories: ExcludeCategorySetting[]): Promise<void> {
  await SecureStorage.setItem(FIXED_COST_EXCLUDE_KEY, JSON.stringify(categories));
}
