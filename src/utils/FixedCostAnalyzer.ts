/**
 * 고정비 자동 분석 유틸리티 (v2 — 보편화)
 *
 * 자동 감지 (보수적) + 사용자 수동 관리 (pin/dismiss) 조합.
 *
 * 자동 감지 기준:
 * 1. 동일(또는 유사 70%+) description + 동일 카테고리(대+소)가 최소 2개월 발생
 * 2. 금액 변동계수(CV) ≤ 0.15 (15% 이내) — 모든 카테고리 동일 기준
 * 3. 제외: 사용자 설정 카테고리, 포괄적 description, dismiss된 항목
 *
 * 사용자 수동 관리:
 * - pin: 자동 감지 안 되더라도 무조건 고정비에 포함 (CV 무시)
 * - dismiss: 자동 감지되더라도 무조건 제외
 */

import firestore from '@react-native-firebase/firestore';
import {
  loadFixedCostPreferences,
  makeFixedCostKey,
  FixedCostPreference,
} from '../services/FixedCostPreferenceService';

/** 고정비로 판단된 거래의 개별 기록 */
export interface FixedCostTransaction {
  date: Date;
  amount: number;
  description: string;
}

export interface FixedCostItem {
  description: string;      // 가맹점명
  categoryName: string;
  categoryGroup: string;
  categoryIcon: string;
  amount: number;           // 고정 금액 또는 평균
  isFixed: boolean;         // true: 매달 동일 금액, false: 변동(평균)
  monthlyAmounts: number[]; // 최근 3개월 금액 배열 [이번달, 1개월전, 2개월전]
  /** 고정비 판단 근거가 된 실제 거래 내역 (월별 그룹) */
  evidence: {
    monthLabel: string;
    transactions: FixedCostTransaction[];
  }[];

  // ── 보편화 신규 필드 ──

  /** 이 항목의 출처: auto(자동감지) | pinned(사용자 등록) */
  source: 'auto' | 'pinned';

  /** preferences 키 (pin/dismiss 조작에 사용) */
  preferenceKey: string;

  /** 이번 달 아직 미발생이지만 예상 발생일이 안 지난 상태 */
  isPending: boolean;

  /** pending일 때 예상 금액 (직전 달 금액 또는 평균) */
  expectedAmount: number;

  /** 예상 발생일 (이전 달 거래일 평균) */
  expectedDay?: number;
}

interface FiscalCycleHelper {
  getDateRange: (date: Date) => { start: Date; end: Date };
}

// ── 필터링 상수 ──

/** 고정비 제외 카테고리 설정 타입 */
export interface ExcludeCategory {
  group: string;     // 카테고리 그룹명 (예: '식비')
  name?: string;     // 소카테고리명 (미지정 시 그룹 전체 제외)
}

/** 포괄적/일반적 description 블랙리스트 (정규화 후 부분 매칭) */
const DESCRIPTION_BLACKLIST = [
  '카드결제', '간편결제', '이체', '출금', '입금', '송금',
  '체크카드', '신용카드', '자동이체', '결제', '수수료',
];

/** 최소 평균 금액 (이하 무시) */
const MIN_AMOUNT = 1000;

/** 변동계수(CV) 상한 — 초과 시 고정비 아님 (모든 카테고리 동일) */
const MAX_CV = 0.30;

/** description 유사도 임계값 (이상이면 같은 항목으로 병합) */
const SIMILARITY_THRESHOLD = 0.7;

// ── 유틸리티 함수 ──

/** 레벤슈타인 유사도 (0~1, 1이 완전 일치) */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return 1 - matrix[a.length][b.length] / maxLen;
}

/** description 정규화 */
function normalizeDescription(desc: string): string {
  let normalized = desc;
  // 괄호와 내용 제거: "쿠팡(와우멤" → "쿠팡"
  normalized = normalized.replace(/[(\[（【].*/g, '');
  // 법인명 제거
  normalized = normalized.replace(/(주식회사|㈜|\(주\)|유한회사|유한공사)/g, '');
  // 특수문자, 공백 제거
  normalized = normalized.replace(/[^가-힣a-zA-Z0-9_]/g, '');
  return normalized || desc.trim();
}

/** 블랙리스트 체크 */
function isBlacklistedDescription(normalizedDesc: string): boolean {
  const baseName = normalizedDesc.split('_')[0];
  return DESCRIPTION_BLACKLIST.some(bl => baseName.includes(bl));
}

// ── 내부 타입 ──

interface MonthlyBucket {
  amounts: number[];
  count: number;
  transactions: FixedCostTransaction[];
}

interface DescEntry {
  displayName: string;
  categoryName: string;
  categoryGroup: string;
  categoryIcon: string;
  normalizedDesc: string;
  monthly: MonthlyBucket[];
}

/**
 * 고정비 분석 (보편화 v2)
 */
export async function analyzeFixedCosts(
  householdId: string,
  currentMonth: Date,
  userId: string,
  viewMode: 'all' | 'personal' | 'couple',
  fiscalCycle: FiscalCycleHelper,
  excludeCategories: ExcludeCategory[] = [{ group: '식비' }],
): Promise<FixedCostItem[]> {
  // ── 1. 사용자 고정비 설정 로드 ──
  const preferences = await loadFixedCostPreferences(householdId);

  // ── 2. 최근 3개월 날짜 범위 계산 ──
  const months: Date[] = [];
  for (let i = 0; i < 3; i++) {
    months.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1));
  }

  const monthLabels = months.map(m =>
    `${m.getFullYear()}년 ${m.getMonth() + 1}월`,
  );

  const monthRanges = months.map(m => fiscalCycle.getDateRange(m));
  const overallStart = monthRanges[2].start;
  const overallEnd = monthRanges[0].end;

  // ── 3. Firestore에서 3개월 데이터 조회 (expense만) ──
  const snap = await firestore()
    .collection('households').doc(householdId)
    .collection('transactions')
    .where('date', '>=', overallStart)
    .where('date', '<=', overallEnd)
    .get();

  const allTx = snap.docs
    .filter(doc => doc.data().type === 'expense')
    .map(doc => {
      const d = doc.data();
      return {
        amount: d.amount || 0,
        description: (d.description || '').trim(),
        categoryName: d.categoryName || '',
        categoryGroup: d.categoryGroup || '',
        categoryIcon: d.categoryIcon || '',
        date: d.date?.toDate() || new Date(),
        isCouple: d.isCouple || false,
        createdBy: d.createdBy || '',
      };
    });

  // ── 4. viewMode 필터 ──
  const filteredTx = allTx.filter(tx => {
    if (viewMode === 'couple') return tx.isCouple;
    if (viewMode === 'personal') return !tx.isCouple && tx.createdBy === userId;
    return tx.isCouple || tx.createdBy === userId;
  });

  // ── 5. description + 카테고리(대+소) 기준으로 월별 데이터 집계 ──
  const descMap: Record<string, DescEntry> = {};

  filteredTx.forEach(tx => {
    if (!tx.description) return;

    const monthIdx = monthRanges.findIndex(({ start, end }) =>
      tx.date >= start && tx.date <= end,
    );
    if (monthIdx < 0) return;

    const normalizedDesc = normalizeDescription(tx.description);

    // 블랙리스트 description 제외
    if (isBlacklistedDescription(normalizedDesc)) return;

    // 키: 정규화된 description + 대카테고리 + 소카테고리
    const key = makeFixedCostKey(normalizedDesc, tx.categoryGroup, tx.categoryName);

    if (!descMap[key]) {
      descMap[key] = {
        displayName: tx.description,
        categoryName: tx.categoryName,
        categoryGroup: tx.categoryGroup,
        categoryIcon: tx.categoryIcon,
        normalizedDesc,
        monthly: months.map(() => ({
          amounts: [],
          count: 0,
          transactions: [],
        })),
      };
    }
    const entry = descMap[key];
    if (monthIdx === 0) {
      entry.displayName = tx.description;
    }

    entry.monthly[monthIdx].amounts.push(tx.amount);
    entry.monthly[monthIdx].count++;
    entry.monthly[monthIdx].transactions.push({
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
    });
  });

  // ── 6. 유사 description 병합 (같은 대카테고리 + 소카테고리 내, 유사도 70%+) ──
  const descKeys = Object.keys(descMap);
  const mergedKeys = new Set<string>();

  for (let i = 0; i < descKeys.length; i++) {
    if (mergedKeys.has(descKeys[i])) continue;
    const a = descMap[descKeys[i]];

    for (let j = i + 1; j < descKeys.length; j++) {
      if (mergedKeys.has(descKeys[j])) continue;
      const b = descMap[descKeys[j]];

      // 같은 대카테고리 + 소카테고리만 병합 대상
      if (a.categoryGroup !== b.categoryGroup) continue;
      if (a.categoryName !== b.categoryName) continue;

      // description 유사도 체크
      if (similarity(a.normalizedDesc, b.normalizedDesc) < SIMILARITY_THRESHOLD) continue;

      // 병합: b → a
      for (let m = 0; m < a.monthly.length; m++) {
        a.monthly[m].amounts.push(...b.monthly[m].amounts);
        a.monthly[m].count += b.monthly[m].count;
        a.monthly[m].transactions.push(...b.monthly[m].transactions);
      }
      mergedKeys.add(descKeys[j]);
    }
  }
  mergedKeys.forEach(key => delete descMap[key]);

  // ── 7. 고정비 판단 ──
  const fixedCosts: FixedCostItem[] = [];
  const processedKeys = new Set<string>();

  const now = new Date();
  const isCurrentMonthActual =
    currentMonth.getFullYear() === now.getFullYear() &&
    currentMonth.getMonth() === now.getMonth();

  Object.entries(descMap).forEach(([key, data]) => {
    processedKeys.add(key);

    const pref = preferences[key];

    // dismiss된 항목 → 무조건 제외
    if (pref?.action === 'dismiss') return;

    const isPinned = pref?.action === 'pin';

    // 제외 카테고리 체크 (pin된 항목은 제외 안 함)
    if (!isPinned) {
      const isExcluded = excludeCategories.some(ec =>
        ec.name
          ? data.categoryGroup === ec.group && data.categoryName === ec.name
          : data.categoryGroup === ec.group,
      );
      if (isExcluded) return;
    }

    // 최소 연속 2개월 발생 필수 (pin이면 1개월도 OK)
    // 9월 발생, 10월 미발생, 11월 발생 처럼 중간에 빠진(퐁당퐁당) 항목은 제외!
    if (!isPinned) {
      const hasM0 = data.monthly[0].count > 0;
      const hasM1 = data.monthly[1].count > 0;
      const hasM2 = data.monthly[2].count > 0;

      if (hasM0) {
        // 이번 달에 발생한 경우: 직전 달(M-1)에도 반드시 발생했어야 연속 2개월 인정
        if (!hasM1) return;
      } else {
        // 이번 달에 아직 미발생인 경우:
        // 과거 월 조회 중이면 탈락
        if (!isCurrentMonthActual) return;
        // 현재 월(진행 중)이면 직전 2개월(M-1과 M-2) 모두 연속 발생했어야 결제 예정으로 인정
        if (!hasM1 || !hasM2) return;
      }
    } else {
      const monthsPresent = data.monthly.filter(m => m.count > 0).length;
      if (monthsPresent < 1) return;
    }

    // 각 월의 합계 (표시용)
    const monthlyAmounts = data.monthly.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );

    // CV/평균 계산용: 현재 진행 중인 달은 제외 (이전 달만으로 판단)
    // 이번 달은 아직 진행 중이라 추가 입금 등으로 금액이 불완전할 수 있음
    const cvMonthlyData = isCurrentMonthActual
      ? data.monthly.slice(1) // M-1, M-2만
      : data.monthly;         // 과거 월 조회 시 전부 포함
    const activeMonths = cvMonthlyData.filter(m => m.count > 0);
    const activeAmounts = activeMonths.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );

    // 평균 금액 (이전 발생 월 기준)
    const avg = activeAmounts.length > 0
      ? activeAmounts.reduce((s, a) => s + a, 0) / activeAmounts.length
      : 0;

    // 최소 금액 체크 (pin이면 건너뜀)
    if (!isPinned && avg < MIN_AMOUNT) return;

    // 변동계수(CV) 체크 — 이전 달 기준, 모든 카테고리 동일 (pin이면 건너뜀)
    if (!isPinned && activeAmounts.length >= 2) {
      const variance = activeAmounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / activeAmounts.length;
      const stdDev = Math.sqrt(variance);
      const cv = avg > 0 ? stdDev / avg : 1;
      if (cv > MAX_CV) return;
    }

    // 금액 동일 여부 (이전 발생 월 기준)
    const allSame = activeAmounts.length > 0 && activeAmounts.every(a => a === activeAmounts[0]);

    // 고정비 금액: 이전 달 기준 (이번 달 불완전한 금액 제외)
    const fixedAmount = allSame ? activeAmounts[0] : Math.round(avg);

    // 예상 금액 (이번 달 미발생 시 표시용)
    const expectedAmount = activeAmounts.length > 0
      ? activeAmounts[0]
      : Math.round(avg);

    const evidence = data.monthly.map((m, idx) => ({
      monthLabel: monthLabels[idx],
      transactions: m.transactions.sort((a, b) => a.date.getTime() - b.date.getTime()),
    }));

    fixedCosts.push({
      description: data.displayName,
      categoryName: data.categoryName,
      categoryGroup: data.categoryGroup,
      categoryIcon: data.categoryIcon,
      amount: fixedAmount,
      isFixed: allSame,
      monthlyAmounts,
      evidence,
      source: isPinned ? 'pinned' : 'auto',
      preferenceKey: key,
      isPending: false,
      expectedAmount,
      expectedDay: undefined,
    });
  });

  // ── 8. 카테고리 단위 추가 감지 ──
  // description 기반으로 고정비에 잡히지 않은 "나머지" 거래를 카테고리별로 묶어서 추가 감지
  // (점심처럼 가맹점이 매번 달라도 카테고리 합계가 매달 비슷하면 고정비로 잡기 위함)

  const fixedDescKeys = new Set<string>();
  // 고정비로 잡힌 description key 수집 (병합된 것 포함)
  Object.keys(descMap).forEach(key => {
    if (fixedCosts.some(fc => fc.preferenceKey === key)) {
      fixedDescKeys.add(key);
    }
  });

  // 카테고리별 나머지 거래 집계
  const catMap: Record<string, {
    categoryName: string;
    categoryGroup: string;
    categoryIcon: string;
    monthly: { amounts: number[]; transactions: FixedCostTransaction[] }[];
  }> = {};

  filteredTx.forEach(tx => {
    if (!tx.description || !tx.categoryName) return;

    const monthIdx = monthRanges.findIndex(({ start, end }) =>
      tx.date >= start && tx.date <= end,
    );
    if (monthIdx < 0) return;

    const normalizedDesc = normalizeDescription(tx.description);
    if (isBlacklistedDescription(normalizedDesc)) return;

    // 이미 description 기반으로 고정비에 잡힌 거래는 제외
    const descKey = makeFixedCostKey(normalizedDesc, tx.categoryGroup, tx.categoryName);
    if (fixedDescKeys.has(descKey)) return;

    // 제외 카테고리 체크
    const isExcluded = excludeCategories.some(ec =>
      ec.name
        ? tx.categoryGroup === ec.group && tx.categoryName === ec.name
        : tx.categoryGroup === ec.group,
    );
    if (isExcluded) return;

    const catKey = `${tx.categoryGroup}__${tx.categoryName}`;
    if (!catMap[catKey]) {
      catMap[catKey] = {
        categoryName: tx.categoryName,
        categoryGroup: tx.categoryGroup,
        categoryIcon: tx.categoryIcon,
        monthly: months.map(() => ({ amounts: [], transactions: [] })),
      };
    }

    catMap[catKey].monthly[monthIdx].amounts.push(tx.amount);
    catMap[catKey].monthly[monthIdx].transactions.push({
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
    });
  });

  // 카테고리별 CV 계산 & 고정비 추가
  Object.entries(catMap).forEach(([catKey, catData]) => {
    // 최소 연속 2개월 발생 필수 (퐁당퐁당 제외)
    const hasCatM0 = catData.monthly[0].amounts.length > 0;
    const hasCatM1 = catData.monthly[1].amounts.length > 0;
    const hasCatM2 = catData.monthly[2].amounts.length > 0;

    if (hasCatM0) {
      if (!hasCatM1) return; // 이번 달 발생 시 직전 달에도 반드시 발생했어야 인정
    } else {
      if (!isCurrentMonthActual) return;
      if (!hasCatM1 || !hasCatM2) return; // 이번 달 미발생 시 직전 2개월 연속 발생해야 인정
    }

    // CV 계산 (현재 월 제외)
    const cvCatData = isCurrentMonthActual
      ? catData.monthly.slice(1)
      : catData.monthly;
    const catActiveAmounts = cvCatData
      .filter(m => m.amounts.length > 0)
      .map(m => m.amounts.reduce((s, a) => s + a, 0));

    if (catActiveAmounts.length < 1) return;

    const catAvg = catActiveAmounts.reduce((s, a) => s + a, 0) / catActiveAmounts.length;
    if (catAvg < MIN_AMOUNT) return;

    if (catActiveAmounts.length >= 2) {
      const catVariance = catActiveAmounts.reduce((s, a) => s + Math.pow(a - catAvg, 2), 0) / catActiveAmounts.length;
      const catCv = catAvg > 0 ? Math.sqrt(catVariance) / catAvg : 1;
      if (catCv > MAX_CV) return;
    }

    // preferenceKey: 카테고리 기반 키
    const catPrefKey = makeFixedCostKey('__category__', catData.categoryGroup, catData.categoryName);

    // dismiss 체크
    const catPref = preferences[catPrefKey];
    if (catPref?.action === 'dismiss') return;

    const catMonthlyAmounts = catData.monthly.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );
    const catAllSame = catActiveAmounts.length > 0 && catActiveAmounts.every(a => a === catActiveAmounts[0]);
    const catFixedAmount = catAllSame ? catActiveAmounts[0] : Math.round(catAvg);
    const catExpectedAmount = catActiveAmounts.length > 0 ? catActiveAmounts[0] : Math.round(catAvg);

    const catEvidence = catData.monthly.map((m, idx) => ({
      monthLabel: monthLabels[idx],
      transactions: m.transactions.sort((a, b) => a.date.getTime() - b.date.getTime()),
    }));

    const isPinned = catPref?.action === 'pin';

    fixedCosts.push({
      description: `${catData.categoryName} 외`,
      categoryName: catData.categoryName,
      categoryGroup: catData.categoryGroup,
      categoryIcon: catData.categoryIcon,
      amount: catFixedAmount,
      isFixed: catAllSame,
      monthlyAmounts: catMonthlyAmounts,
      evidence: catEvidence,
      source: isPinned ? 'pinned' : 'auto',
      preferenceKey: catPrefKey,
      isPending: false,
      expectedAmount: catExpectedAmount,
      expectedDay: undefined,
    });
  });

  fixedCosts.sort((a, b) => b.amount - a.amount);
  return fixedCosts;
}
