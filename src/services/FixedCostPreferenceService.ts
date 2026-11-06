/**
 * 고정비 사용자 설정 서비스 (Firestore)
 *
 * 사용자가 수동으로 고정비를 핀(등록)/해제(dismiss)할 수 있는 기능.
 * households/{householdId}/settings/fixedCostPreferences 문서에 저장.
 * 커플 간 설정 공유를 위해 Firestore 사용.
 */

import firestore from '@react-native-firebase/firestore';

/** 고정비 사용자 설정 */
export interface FixedCostPreference {
  /** 고유 키: normalizedDescription__categoryGroup__categoryName */
  key: string;

  /** 동작: pin(고정비로 등록) | dismiss(고정비에서 제외) */
  action: 'pin' | 'dismiss';

  /** 화면에 표시할 이름 */
  displayName: string;

  /** 카테고리 그룹 (대카테고리) */
  categoryGroup: string;

  /** 카테고리 이름 (소카테고리) */
  categoryName: string;

  /** 카테고리 아이콘 */
  categoryIcon: string;

  /** 등록/해제 시각 */
  updatedAt: number;
}

/**
 * 고정비 키 생성
 * description 정규화 → categoryGroup → categoryName 조합
 */
export function makeFixedCostKey(
  normalizedDesc: string,
  categoryGroup: string,
  categoryName: string,
): string {
  return `${normalizedDesc}__${categoryGroup}__${categoryName}`;
}

/** Firestore 문서 참조 */
function getPrefsDocRef(householdId: string) {
  return firestore()
    .collection('households').doc(householdId)
    .collection('settings').doc('fixedCostPreferences');
}

/**
 * 고정비 설정 전체 로드
 */
export async function loadFixedCostPreferences(
  householdId: string,
): Promise<Record<string, FixedCostPreference>> {
  try {
    const doc = await getPrefsDocRef(householdId).get();
    if (!doc.exists) return {};
    return doc.data()?.preferences || {};
  } catch (e) {
    console.warn('[FixedCostPref] loadPreferences failed:', e);
    return {};
  }
}

/**
 * 고정비로 핀(등록)
 */
export async function pinFixedCost(
  householdId: string,
  pref: Omit<FixedCostPreference, 'action' | 'updatedAt'>,
): Promise<void> {
  try {
    await getPrefsDocRef(householdId).set({
      preferences: {
        [pref.key]: {
          ...pref,
          action: 'pin',
          updatedAt: Date.now(),
        },
      },
    }, { merge: true });
  } catch (e) {
    console.warn('[FixedCostPref] pinFixedCost failed:', e);
    throw e;
  }
}

/**
 * 고정비에서 해제 (dismiss)
 */
export async function dismissFixedCost(
  householdId: string,
  pref: Omit<FixedCostPreference, 'action' | 'updatedAt'>,
): Promise<void> {
  try {
    await getPrefsDocRef(householdId).set({
      preferences: {
        [pref.key]: {
          ...pref,
          action: 'dismiss',
          updatedAt: Date.now(),
        },
      },
    }, { merge: true });
  } catch (e) {
    console.warn('[FixedCostPref] dismissFixedCost failed:', e);
    throw e;
  }
}

/**
 * 설정 복원 (pin/dismiss 해제 → 자동 감지 모드로 복귀)
 */
export async function restoreFixedCost(
  householdId: string,
  key: string,
): Promise<void> {
  try {
    const docRef = getPrefsDocRef(householdId);
    const doc = await docRef.get();
    if (!doc.exists) return;

    const prefs = { ...(doc.data()?.preferences || {}) };
    delete prefs[key];
    await docRef.set({ preferences: prefs });
  } catch (e) {
    console.warn('[FixedCostPref] restoreFixedCost failed:', e);
    throw e;
  }
}
