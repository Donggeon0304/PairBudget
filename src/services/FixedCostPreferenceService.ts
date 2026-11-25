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

  /** 동작: pin(고정비로 등록) | dismiss(고정비에서 제외) | alias(이름/카테고리 커스텀) */
  action: 'pin' | 'dismiss' | 'alias';

  /** 화면에 표시할 이름 (원래 가맹점명) */
  displayName: string;

  /** 사용자가 직접 지정한 별칭 (예: "청년도약계좌", "주택청약") */
  customName?: string;

  /** 카테고리 그룹 (대카테고리) */
  categoryGroup: string;

  /** 카테고리 이름 (소카테고리) */
  categoryName: string;

  /** 카테고리 아이콘 */
  categoryIcon: string;

  /** 사용자 커스텀 카테고리 그룹 */
  customCategoryGroup?: string;

  /** 사용자 커스텀 카테고리 이름 */
  customCategoryName?: string;

  /** 사용자 커스텀 카테고리 아이콘 */
  customCategoryIcon?: string;

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

/** 객체에서 undefined 속성을 제거하여 Firestore 직렬화 에러 방지 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  Object.keys(obj).forEach(k => {
    if (obj[k] !== undefined) {
      result[k] = obj[k];
    }
  });
  return result as T;
}

/**
 * 고정비로 핀(등록)
 */
export async function pinFixedCost(
  householdId: string,
  pref: Omit<FixedCostPreference, 'action' | 'updatedAt'>,
): Promise<void> {
  try {
    const cleanPref = stripUndefined({
      ...pref,
      action: 'pin' as const,
      updatedAt: Date.now(),
    });
    await getPrefsDocRef(householdId).set({
      preferences: {
        [pref.key]: cleanPref,
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
    const cleanPref = stripUndefined({
      ...pref,
      action: 'dismiss' as const,
      updatedAt: Date.now(),
    });
    await getPrefsDocRef(householdId).set({
      preferences: {
        [pref.key]: cleanPref,
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

/**
 * 고정비 커스텀 정보(별칭, 카테고리) 수정 저장
 */
export async function updateFixedCostCustomProps(
  householdId: string,
  key: string,
  props: {
    displayName: string;
    customName?: string;
    categoryGroup: string;
    categoryName: string;
    categoryIcon: string;
    customCategoryGroup?: string;
    customCategoryName?: string;
    customCategoryIcon?: string;
  },
): Promise<void> {
  try {
    const docRef = getPrefsDocRef(householdId);
    const doc = await docRef.get();
    const allPrefs = { ...(doc.data()?.preferences || {}) };
    const existing = allPrefs[key] || {};

    const nextEntry: Record<string, any> = {
      ...existing,
      key,
      action: existing.action || 'alias',
      displayName: props.displayName,
      categoryGroup: props.categoryGroup,
      categoryName: props.categoryName,
      categoryIcon: props.categoryIcon,
      updatedAt: Date.now(),
    };

    // 별칭 처리 (빈 값/undefined 전달 시 기존 별칭도 제거)
    if (props.customName && props.customName.trim()) {
      nextEntry.customName = props.customName.trim();
    } else if ('customName' in props) {
      delete nextEntry.customName;
    }

    // 커스텀 카테고리 처리
    if (props.customCategoryGroup !== undefined) nextEntry.customCategoryGroup = props.customCategoryGroup;
    if (props.customCategoryName !== undefined) nextEntry.customCategoryName = props.customCategoryName;
    if (props.customCategoryIcon !== undefined) nextEntry.customCategoryIcon = props.customCategoryIcon;

    allPrefs[key] = stripUndefined(nextEntry);
    await docRef.set({ preferences: allPrefs });
  } catch (e) {
    console.warn('[FixedCostPref] updateFixedCostCustomProps failed:', e);
    throw e;
  }
}

