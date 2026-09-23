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
      memo: (d.memo || '').trim(),
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

  // description 정규화: 유사한 가맹점명을 같은 그룹으로 합치기
  const normalizeDescription = (desc: string): string => {
    let normalized = desc;
    // 괄호와 내용 제거: "쿠팡(와우멤" → "쿠팡"
    normalized = normalized.replace(/[(\[（【].*/g, '');
    // 법인명 제거: "쿠팡 주식회사" → "쿠팡"
    normalized = normalized.replace(/(주식회사|㈜|\(주\)|유한회사|유한공사)/g, '');
    // 언더스코어 뒤 제거: "배민클럽_우" → "배민클럽"
    normalized = normalized.replace(/_.*$/, '');
    // 특수문자, 공백 제거
    normalized = normalized.replace(/[^가-힣a-zA-Z0-9]/g, '');
    // 빈 문자열 방지
    return normalized || desc.trim();
  };

  // description별 월별 데이터 집계 (정규화된 키 기준)
  const descMap: Record<string, {
    displayName: string;    // 화면에 보여줄 원본 이름 (가장 최근 것)
    categoryName: string;
    categoryGroup: string;
    categoryIcon: string;
    memos: string[];        // memo 텍스트 모음 (2차 매칭용)
    monthly: { amounts: number[]; count: number }[];
  }> = {};

  filteredTx.forEach(tx => {
    if (!tx.description) return;

    // 어느 월에 해당하는지 확인
    const monthIdx = monthRanges.findIndex(({ start, end }) =>
      tx.date >= start && tx.date <= end,
    );
    if (monthIdx < 0) return;

    const key = normalizeDescription(tx.description);
    if (!descMap[key]) {
      descMap[key] = {
        displayName: tx.description,
        categoryName: tx.categoryName,
        categoryGroup: tx.categoryGroup,
        categoryIcon: tx.categoryIcon,
        memos: [],
        monthly: months.map(() => ({ amounts: [], count: 0 })),
      };
    }
    const entry = descMap[key];
    // 가장 최근 거래의 이름을 표시명으로 사용
    if (monthIdx === 0) {
      entry.displayName = tx.description;
    }
    if (tx.memo) {
      entry.memos.push(tx.memo);
    }
    entry.monthly[monthIdx].amounts.push(tx.amount);
    entry.monthly[monthIdx].count++;
  });

  // 2차 매칭: 유사 항목 병합
  // 조건: 같은 카테고리 + 금액 ±5% + (공통 키워드 3글자 이상 OR 키가 상대 memo에 포함)
  const descKeys = Object.keys(descMap);
  const mergedKeys = new Set<string>();

  // memo 텍스트 정규화 (공백/특수문자 제거)
  const normalizeMemo = (memo: string) => memo.replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();

  for (let i = 0; i < descKeys.length; i++) {
    if (mergedKeys.has(descKeys[i])) continue;
    const a = descMap[descKeys[i]];

    for (let j = i + 1; j < descKeys.length; j++) {
      if (mergedKeys.has(descKeys[j])) continue;
      const b = descMap[descKeys[j]];

      // 같은 카테고리 그룹?
      if (a.categoryGroup !== b.categoryGroup) continue;

      // 금액 비슷한가? (±5%) — 먼저 체크 (빠른 필터)
      const aAmts = a.monthly.flatMap(m => m.amounts);
      const bAmts = b.monthly.flatMap(m => m.amounts);
      if (aAmts.length === 0 || bAmts.length === 0) continue;
      const aAvg = aAmts.reduce((s, v) => s + v, 0) / aAmts.length;
      const bAvg = bAmts.reduce((s, v) => s + v, 0) / bAmts.length;
      const maxAvg = Math.max(aAvg, bAvg);
      if (maxAvg === 0) continue;
      const ratio = Math.min(aAvg, bAvg) / maxAvg;
      if (ratio < 0.95) continue;

      // 유사도 판단: 키 공통 OR 키↔memo 포함
      let isSimilar = false;

      // 방법 1: 정규화 키 사이 공통 키워드 3글자 이상
      const shorter = descKeys[i].length <= descKeys[j].length ? descKeys[i] : descKeys[j];
      const longer = descKeys[i].length > descKeys[j].length ? descKeys[i] : descKeys[j];
      for (let len = 3; len <= shorter.length && !isSimilar; len++) {
        for (let s = 0; s <= shorter.length - len; s++) {
          if (longer.includes(shorter.substring(s, s + len))) {
            isSimilar = true;
            break;
          }
        }
      }

      // 방법 2: 한쪽 키가 상대 memo에 포함 (3글자 이상 키만)
      if (!isSimilar && descKeys[i].length >= 3) {
        const keyI = descKeys[i].toLowerCase();
        isSimilar = b.memos.some(m => normalizeMemo(m).includes(keyI));
      }
      if (!isSimilar && descKeys[j].length >= 3) {
        const keyJ = descKeys[j].toLowerCase();
        isSimilar = a.memos.some(m => normalizeMemo(m).includes(keyJ));
      }

      if (!isSimilar) continue;

      // 합치기: b → a에 병합
      for (let m = 0; m < a.monthly.length; m++) {
        a.monthly[m].amounts.push(...b.monthly[m].amounts);
        a.monthly[m].count += b.monthly[m].count;
      }
      a.memos.push(...b.memos);
      mergedKeys.add(descKeys[j]);
    }
  }
  // 병합된 항목 제거
  mergedKeys.forEach(key => delete descMap[key]);

  // 고정비 판단
  const fixedCosts: FixedCostItem[] = [];
  // 고정비 대상에서 제외할 카테고리 그룹 (식당, 쇼핑은 반복되어도 고정비가 아님)
  const EXCLUDE_GROUPS = ['식비', '쇼핑'];

  Object.entries(descMap).forEach(([desc, data]) => {
    // 제외 카테고리 그룹
    if (EXCLUDE_GROUPS.includes(data.categoryGroup)) return;

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
      description: data.displayName,
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
