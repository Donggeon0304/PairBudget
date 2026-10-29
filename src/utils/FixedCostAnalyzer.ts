/**
 * 고정비 자동 분석 유틸리티
 * 최근 3개월 거래를 분석해 매달 반복되는 지출을 감지
 *
 * 고정비 판단 기준:
 * 1. 동일(또는 유사 70%+) description + 동일 카테고리가 최소 2개월 발생
 * 2. 금액 변동계수(CV) ≤ 0.15 (15% 이내)
 * 3. 제외: 사용자 설정 카테고리, 포괄적 description
 */

import firestore from '@react-native-firebase/firestore';

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

/** 변동계수(CV) 상한 — 초과 시 고정비 아님 */
const MAX_CV = 0.15;

/** description 유사도 임계값 (이상이면 같은 항목으로 병합) */
const SIMILARITY_THRESHOLD = 0.7;

// ── 유틸리티 함수 ──

/** 레벤슈타인 유사도 (0~1, 1이 완전 일치) */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // 레벤슈타인 거리 계산
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

/**
 * 고정비 분석
 */
export async function analyzeFixedCosts(
  householdId: string,
  currentMonth: Date,
  userId: string,
  viewMode: 'all' | 'personal' | 'couple',
  fiscalCycle: FiscalCycleHelper,
  excludeCategories: ExcludeCategory[] = [{ group: '식비' }],
): Promise<FixedCostItem[]> {
  // 최근 3개월 Date 객체 (이번달, 1개월전, 2개월전)
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

  // Firestore에서 3개월 데이터 조회
  const snap = await firestore()
    .collection('households').doc(householdId)
    .collection('transactions')
    .where('date', '>=', overallStart)
    .where('date', '<=', overallEnd)
    .get();

  // 금융 카테고리(적금/보험/대출이자 등)는 income으로 저장되더라도 고정비 분석 대상
  const FINANCE_GROUPS = ['금융'];

  const allTx = snap.docs
    .filter(doc => {
      const d = doc.data();
      return d.type === 'expense' ||
        FINANCE_GROUPS.includes(d.categoryGroup || '');
    })
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
        type: (d.type || 'expense') as 'income' | 'expense',
      };
    });

  // viewMode 필터
  const filteredTx = allTx.filter(tx => {
    if (viewMode === 'couple') return tx.isCouple;
    if (viewMode === 'personal') return !tx.isCouple && tx.createdBy === userId;
    return tx.isCouple || tx.createdBy === userId;
  });

  // ── description 정규화 ──
  const normalizeDescription = (desc: string): string => {
    let normalized = desc;
    // 괄호와 내용 제거: "쿠팡(와우멤" → "쿠팡"
    normalized = normalized.replace(/[(\[（【].*/g, '');
    // 법인명 제거
    normalized = normalized.replace(/(주식회사|㈜|\(주\)|유한회사|유한공사)/g, '');
    // 특수문자, 공백 제거
    normalized = normalized.replace(/[^가-힣a-zA-Z0-9_]/g, '');
    return normalized || desc.trim();
  };

  // ── 블랙리스트 체크 ──
  const isBlacklistedDescription = (normalizedDesc: string): boolean => {
    const baseName = normalizedDesc.split('_')[0];
    return DESCRIPTION_BLACKLIST.some(bl => baseName.includes(bl));
  };

  // ── description + 카테고리 기준으로 월별 데이터 집계 ──
  const descMap: Record<string, {
    displayName: string;
    categoryName: string;
    categoryGroup: string;
    categoryIcon: string;
    normalizedDesc: string;  // 유사도 비교용
    monthly: {
      amounts: number[];
      count: number;
      transactions: FixedCostTransaction[];
    }[];
  }> = {};

  filteredTx.forEach(tx => {
    if (!tx.description) return;

    const monthIdx = monthRanges.findIndex(({ start, end }) =>
      tx.date >= start && tx.date <= end,
    );
    if (monthIdx < 0) return;

    const normalizedDesc = normalizeDescription(tx.description);

    // 블랙리스트 description 제외
    if (isBlacklistedDescription(normalizedDesc)) return;

    // 키: 정규화된 description + 카테고리 그룹
    const key = `${normalizedDesc}__${tx.categoryGroup}`;

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

    // 금융 카테고리: 같은 월에 동일 금액이 이미 있으면 중복(expense+income 양쪽 등록) → 건너뛰기
    if (FINANCE_GROUPS.includes(tx.categoryGroup)) {
      const existingAmounts = entry.monthly[monthIdx].amounts;
      if (existingAmounts.includes(tx.amount) && tx.type === 'income') {
        // expense가 이미 등록된 동일 금액 income은 건너뜀
        return;
      }
    }

    entry.monthly[monthIdx].amounts.push(tx.amount);
    entry.monthly[monthIdx].count++;
    entry.monthly[monthIdx].transactions.push({
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
    });
  });

  // ── 유사 description 병합 (같은 카테고리 내, 유사도 70%+) ──
  const descKeys = Object.keys(descMap);
  const mergedKeys = new Set<string>();

  for (let i = 0; i < descKeys.length; i++) {
    if (mergedKeys.has(descKeys[i])) continue;
    const a = descMap[descKeys[i]];

    for (let j = i + 1; j < descKeys.length; j++) {
      if (mergedKeys.has(descKeys[j])) continue;
      const b = descMap[descKeys[j]];

      // 같은 카테고리 그룹만
      if (a.categoryGroup !== b.categoryGroup) continue;

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

  // ── 고정비 판단 ──
  const fixedCosts: FixedCostItem[] = [];

  // 현재 월이 실제 오늘인지 확인 (과거 월 조회 시 구분)
  const now = new Date();
  const isCurrentMonthActual =
    currentMonth.getFullYear() === now.getFullYear() &&
    currentMonth.getMonth() === now.getMonth();

  Object.entries(descMap).forEach(([, data]) => {
    // 제외 카테고리 체크 (group만 지정 시 그룹 전체 제외, name도 지정 시 해당 소카테고리만 제외)
    const isExcluded = excludeCategories.some(ec =>
      ec.name
        ? data.categoryGroup === ec.group && data.categoryName === ec.name
        : data.categoryGroup === ec.group,
    );
    if (isExcluded) return;

    // 최소 2개월 발생 필수
    const monthsPresent = data.monthly.filter(m => m.count > 0).length;
    if (monthsPresent < 2) return;

    // 현재 월(index 0) 미발생 시 → 예상 발생일이 지났는지 체크
    if (data.monthly[0].count === 0) {
      if (!isCurrentMonthActual) {
        // 과거 월을 보고 있는데 발생 없음 → 확정 제외
        return;
      }
      // 이전 발생 월의 거래 날짜에서 day 추출
      const prevDays: number[] = [];
      for (let m = 1; m < data.monthly.length; m++) {
        data.monthly[m].transactions.forEach(tx => {
          prevDays.push(tx.date.getDate());
        });
      }
      if (prevDays.length > 0) {
        const latestDay = Math.max(...prevDays);
        const currentDay = now.getDate();
        // 예상 발생일 + 5일 마진이 지났으면 → 이번 달엔 안 나올 것 → 제외
        if (currentDay > latestDay + 5) return;
      }
    }

    // 각 월의 합계 (전체)
    const monthlyAmounts = data.monthly.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );

    // 발생 월만의 합계 (CV/평균 계산용)
    const activeMonths = data.monthly.filter(m => m.count > 0);
    const activeAmounts = activeMonths.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );

    // 평균 금액 (발생 월 기준)
    const avg = activeAmounts.reduce((s, a) => s + a, 0) / activeAmounts.length;

    // 최소 금액 체크
    if (avg < MIN_AMOUNT) return;

    // 변동계수(CV) 체크 (발생 월 기준)
    // 금융 카테고리(적금 등)는 여러 건이 합산되므로 CV 상한 완화
    const effectiveMaxCv = FINANCE_GROUPS.includes(data.categoryGroup) ? 0.5 : MAX_CV;
    if (activeAmounts.length >= 2) {
      const variance = activeAmounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / activeAmounts.length;
      const stdDev = Math.sqrt(variance);
      const cv = avg > 0 ? stdDev / avg : 1;
      if (cv > effectiveMaxCv) return;
    }

    // 금액 동일 여부 (발생 월 기준)
    const allSame = activeAmounts.every(a => a === activeAmounts[0]);

    const evidence = data.monthly.map((m, idx) => ({
      monthLabel: monthLabels[idx],
      transactions: m.transactions.sort((a, b) => a.date.getTime() - b.date.getTime()),
    }));

    fixedCosts.push({
      description: data.displayName,
      categoryName: data.categoryName,
      categoryGroup: data.categoryGroup,
      categoryIcon: data.categoryIcon,
      amount: allSame ? activeAmounts[0] : Math.round(avg),
      isFixed: allSame,
      monthlyAmounts,
      evidence,
    });
  });

  fixedCosts.sort((a, b) => b.amount - a.amount);
  return fixedCosts;
}
