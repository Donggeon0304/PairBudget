/**
 * 고정비 자동 분석 유틸리티
 * 최근 3개월 거래를 분석해 매달 반복되는 지출을 감지
 */

import firestore from '@react-native-firebase/firestore';

export interface FixedCostItem {
  description: string;      // 가맹점명
  categoryName: string;
  categoryGroup: string;
  categoryIcon: string;
  amount: number;           // 고정 금액 또는 3개월 평균
  isFixed: boolean;         // true: 매달 동일 금액, false: 변동(평균)
  monthlyAmounts: number[]; // 최근 3개월 금액 배열 [이번달, 1개월전, 2개월전]
}

interface FiscalCycleHelper {
  getDateRange: (date: Date) => { start: Date; end: Date };
}

/**
 * 고정비 분석
 * @param householdId 가계부 ID
 * @param currentMonth 현재 선택된 월
 * @param userId 사용자 UID
 * @param viewMode 개인/공동/전체
 * @param fiscalCycle 회계주기 헬퍼
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

  // 각 월의 날짜 범위
  const monthRanges = months.map(m => fiscalCycle.getDateRange(m));

  // 전체 범위 (가장 과거 시작 ~ 현재 월 끝)
  const overallStart = monthRanges[2].start;
  const overallEnd = monthRanges[0].end;

  // Firestore에서 3개월 데이터 한 번에 조회 (type 필터는 코드에서 처리 — 복합 인덱스 불필요)
  const snap = await firestore()
    .collection('households').doc(householdId)
    .collection('transactions')
    .where('date', '>=', overallStart)
    .where('date', '<=', overallEnd)
    .get();

  const allTx = snap.docs
    .filter(doc => doc.data().type === 'expense') // expense만 대상
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
    return tx.isCouple || tx.createdBy === userId; // all
  });

  // description별 월별 데이터 집계
  const descMap: Record<string, {
    categoryName: string;
    categoryGroup: string;
    categoryIcon: string;
    monthly: { amounts: number[]; count: number }[];
  }> = {};

  filteredTx.forEach(tx => {
    if (!tx.description) return;

    // 어느 월에 해당하는지 확인
    const monthIdx = monthRanges.findIndex(({ start, end }) =>
      tx.date >= start && tx.date <= end,
    );
    if (monthIdx < 0) return;

    if (!descMap[tx.description]) {
      descMap[tx.description] = {
        categoryName: tx.categoryName,
        categoryGroup: tx.categoryGroup,
        categoryIcon: tx.categoryIcon,
        monthly: months.map(() => ({ amounts: [], count: 0 })),
      };
    }
    const entry = descMap[tx.description];
    entry.monthly[monthIdx].amounts.push(tx.amount);
    entry.monthly[monthIdx].count++;
  });

  // 고정비 판단
  const fixedCosts: FixedCostItem[] = [];

  Object.entries(descMap).forEach(([desc, data]) => {
    // 3개월 연속 발생?
    const allMonthsPresent = data.monthly.every(m => m.count > 0);
    if (!allMonthsPresent) return;

    // 월 3건 이하?
    const allLowCount = data.monthly.every(m => m.count <= 3);
    if (!allLowCount) return;

    // 각 월의 합계
    const monthlyAmounts = data.monthly.map(m =>
      m.amounts.reduce((s, a) => s + a, 0),
    );

    // 금액 동일 여부
    const allSame = monthlyAmounts.every(a => a === monthlyAmounts[0]);
    const avgAmount = Math.round(
      monthlyAmounts.reduce((s, a) => s + a, 0) / monthlyAmounts.length,
    );

    fixedCosts.push({
      description: desc,
      categoryName: data.categoryName,
      categoryGroup: data.categoryGroup,
      categoryIcon: data.categoryIcon,
      amount: allSame ? monthlyAmounts[0] : avgAmount,
      isFixed: allSame,
      monthlyAmounts,
    });
  });

  // 금액 순 정렬 (높은 금액이 위로)
  fixedCosts.sort((a, b) => b.amount - a.amount);

  return fixedCosts;
}
