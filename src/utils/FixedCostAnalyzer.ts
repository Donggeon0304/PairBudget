/**
 * 고정비 자동 분석 유틸리티
 * 최근 3개월 거래를 분석해 매달 반복되는 지출을 감지
 *
 * 고정비 판단 기준:
 * 1. 동일 description(정규화)이 3개월 중 2개월 이상 발생
 * 2. 발생 월마다 1~2건 이하
 * 3. 금액 변동계수(CV) ≤ 0.15 (15% 이내)
 * 4. 제외: 식비/쇼핑/교통 카테고리, 포괄적 description
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
    monthLabel: string;       // "2026년 10월" 등
    transactions: FixedCostTransaction[];
  }[];
}

interface FiscalCycleHelper {
  getDateRange: (date: Date) => { start: Date; end: Date };
}

// ── 필터링 상수 ──

/** 고정비 대상에서 제외할 카테고리 그룹 */
const EXCLUDE_GROUPS = ['식비', '쇼핑', '교통'];

/** 포괄적/일반적 description 블랙리스트 (정규화 후 매칭) */
const DESCRIPTION_BLACKLIST = [
  '카드결제', '간편결제', '이체', '출금', '입금', '송금',
  '체크카드', '신용카드', '자동이체', '결제', '수수료',
];

/** 최소 평균 금액 (이하 무시) */
const MIN_AMOUNT = 1000;

/** 변동계수(CV) 상한 — 초과 시 고정비 아님 */
const MAX_CV = 0.15;

/**
 * 고정비 분석
 */
export async function analyzeFixedCosts(
  householdId: string,
  currentMonth: Date,
  userId: string,
  viewMode: 'all' | 'personal' | 'couple',
  fiscalCycle: FiscalCycleHelper,
): Promise<FixedCostItem[]> {
  // 최근 3개월 Date 객체 (이번달, 1개월전, 2개월전)
  const months: Date[] = [];
  for (let i = 0; i < 3; i++) {
    months.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1));
  }

  // 월 레이블 생성
  const monthLabels = months.map(m =>
    `${m.getFullYear()}년 ${m.getMonth() + 1}월`,
  );

  // 각 월의 날짜 범위
  const monthRanges = months.map(m => fiscalCycle.getDateRange(m));

  // 전체 범위
  const overallStart = monthRanges[2].start;
  const overallEnd = monthRanges[0].end;

  // Firestore에서 3개월 데이터 조회
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
    normalized = normalized.replace(/[^가-힣a-zA-Z0-9]/g, '');
    return normalized || desc.trim();
  };

  // ── 블랙리스트 체크 ──
  const isBlacklistedDescription = (normalizedDesc: string): boolean => {
    return DESCRIPTION_BLACKLIST.some(bl => normalizedDesc.includes(bl));
  };

  // ── description별 월별 데이터 집계 ──
  const descMap: Record<string, {
    displayName: string;
    categoryName: string;
    categoryGroup: string;
    categoryIcon: string;
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

    const key = normalizeDescription(tx.description);

    // 블랙리스트 description 제외
    if (isBlacklistedDescription(key)) return;

    if (!descMap[key]) {
      descMap[key] = {
        displayName: tx.description,
        categoryName: tx.categoryName,
        categoryGroup: tx.categoryGroup,
        categoryIcon: tx.categoryIcon,
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

  // ── 고정비 판단 ──
  const fixedCosts: FixedCostItem[] = [];

  Object.entries(descMap).forEach(([, data]) => {
    // 제외 카테고리 그룹
    if (EXCLUDE_GROUPS.includes(data.categoryGroup)) return;

    // 3개월 중 최소 2개월 발생
    const monthsPresent = data.monthly.filter(m => m.count > 0).length;
    if (monthsPresent < 2) return;

    // 발생 월마다 건수 1~2건 (구독/고정비는 월 1~2건이 정상)
    const activeMonths = data.monthly.filter(m => m.count > 0);
    if (!activeMonths.every(m => m.count <= 2)) return;

    // 각 발생 월의 합계
    const activeAmounts = activeMonths.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );

    // 평균 금액
    const avg = activeAmounts.reduce((s, a) => s + a, 0) / activeAmounts.length;

    // 최소 금액 체크
    if (avg < MIN_AMOUNT) return;

    // 변동계수(CV) 체크
    if (activeAmounts.length >= 2) {
      const variance = activeAmounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / activeAmounts.length;
      const stdDev = Math.sqrt(variance);
      const cv = avg > 0 ? stdDev / avg : 1;
      if (cv > MAX_CV) return; // 변동 15% 초과 → 고정비 아님
    }

    // 모든 월의 합계 (미발생 월은 0)
    const monthlyAmounts = data.monthly.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );

    // 금액 동일 여부 (발생한 월 기준)
    const allSame = activeAmounts.every(a => a === activeAmounts[0]);

    // 근거 데이터 구성
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

  // 금액 순 정렬 (높은 금액이 위로)
  fixedCosts.sort((a, b) => b.amount - a.amount);

  return fixedCosts;
}
