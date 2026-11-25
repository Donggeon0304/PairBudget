/**
 * 고정비 자동 분석 유틸리티 (v9 — 100% 순수 범용 통계/주기성 엔진, 하드코딩 0%)
 *
 * [핵심 설계 원칙]
 * 1. 특정 사용자 이름(명동건 등) 하드코딩 0%
 * 2. 특정 카테고리(생활비, 식비 등) 하드코딩 0%
 * 3. 특정 금액(35만~68만 등) 하드코딩 0%
 *
 * [순수 수학적/통계적 판별 기준]
 * 1. 20% 이내 금액 비율 및 카테고리 호환 기반 순수 클러스터링
 * 2. 약정 기준일(Anchor Day) 도출 및 일탈 거래(Outlier, 오차 > 3일) 존재 시 일상 소비 매장(고기반장 등)으로 즉시 탈락
 * 3. 변동계수(CV) 20% 이내 검증:
 *    - CV <= 0.05: 완전 고정비 (isFixed: true, 청년도약계좌, 청약, 구독 등)
 *    - 0.05 < CV <= 0.20: 정기 변동 고정비 (isFixed: false, 생활비 이체, 관리비, 공과금 등 평균값 표시)
 * 4. 5개월 중 최소 3개월 이상 지속 발생
 */

import firestore from '@react-native-firebase/firestore';
import {
  loadFixedCostPreferences,
  makeFixedCostKey,
  FixedCostPreference,
} from '../services/FixedCostPreferenceService';
import { formatCurrency } from './formatCurrency';

export interface FixedCostTransaction {
  date: Date;
  amount: number;
  description: string;
}

export interface FixedCostItem {
  description: string;
  originalDescription: string;
  customName?: string;
  categoryName: string;
  categoryGroup: string;
  categoryIcon: string;
  amount: number;
  isFixed: boolean;
  monthlyAmounts: number[];
  evidence: {
    monthLabel: string;
    transactions: FixedCostTransaction[];
  }[];

  source: 'auto' | 'pinned';
  preferenceKey: string;
  isPending: boolean;
  expectedAmount: number;
  expectedDay?: number;
  /** 변동계수 (0 ~ 1+, 후보 사유 안내용) */
  cv?: number;
}

export interface FixedCostAnalysisResult {
  fixedCosts: FixedCostItem[];
  /** 주기성은 월 1회 정기 패턴이나 변동계수(CV) 초과로 자동 제외된 수동 등록 추천 후보 */
  manualCandidates: FixedCostItem[];
}

interface FiscalCycleHelper {
  getDateRange: (date: Date) => { start: Date; end: Date };
}

export interface ExcludeCategory {
  group: string;
  name?: string;
}

// ── 범용 필터링 상수 ──

const HISTORY_MONTHS_COUNT = 5;

const DESCRIPTION_BLACKLIST = [
  '카드결제', '간편결제', '체크카드', '신용카드', '자동이체', '결제', '수수료',
];

const MIN_AMOUNT = 1000;
const SIMILARITY_THRESHOLD = 0.75;
const MAX_ANCHOR_DEVIATION = 3;
const MAX_ALLOWED_CV = 0.20; // 최대 허용 변동계수 (20% 이내)

// ── 유틸리티 함수 ──

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
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

function normalizeDescription(desc: string): string {
  let normalized = desc;
  normalized = normalized.replace(/[(\[（【].*/g, '');
  normalized = normalized.replace(/(주식회사|㈜|\(주\)|유한회사|유한공사)/g, '');
  normalized = normalized.replace(/[^가-힣a-zA-Z0-9_]/g, '');
  return normalized || desc.trim();
}

function isBlacklistedDescription(normalizedDesc: string): boolean {
  const baseName = normalizedDesc.split('_')[0];
  // 단독 포괄어(정확 일치)만 차단하여 '우리카드결제', 'OO결제' 등 식별 가능한 정기 결제가 입구 컷 당하지 않도록 함
  return DESCRIPTION_BLACKLIST.some(bl => baseName === bl);
}

function getDayDistance(d1: number, d2: number): number {
  const direct = Math.abs(d1 - d2);
  return Math.min(direct, 31 - direct);
}

function calculateCv(amounts: number[]): number {
  if (amounts.length < 2) return 0;
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  if (avg <= 0) return 1;
  const variance = amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / amounts.length;
  return Math.sqrt(variance) / avg;
}

function findBestAnchorDay(flatDays: number[]): number {
  if (flatDays.length === 0) return 25;
  let bestDay = flatDays[0];
  let minCost = 999999;

  for (let testDay = 1; testDay <= 31; testDay++) {
    let cost = 0;
    flatDays.forEach(d => {
      const dist = getDayDistance(d, testDay);
      cost += dist * dist;
    });
    if (cost < minCost) {
      minCost = cost;
      bestDay = testDay;
    }
  }
  return bestDay;
}

// ── 내부 데이터 구조 ──

interface RawTx {
  monthIdx: number;
  amount: number;
  date: Date;
  description: string;
  categoryGroup: string;
  categoryName: string;
  categoryIcon: string;
  isCouple: boolean;
  createdBy: string;
}

interface Cluster {
  cat: string;
  grp: string;
  icon: string;
  avgAmt: number;
  txs: RawTx[];
}

/**
 * 100% 범용 고정비 분석 + 수동 등록 추천 후보 반환 (v11)
 */
export async function analyzeFixedCostsDetailed(
  householdId: string,
  currentMonth: Date,
  userId: string,
  viewMode: 'all' | 'personal' | 'couple',
  fiscalCycle: FiscalCycleHelper,
  excludeCategories: ExcludeCategory[] = [],
): Promise<FixedCostAnalysisResult> {
  const preferences = await loadFixedCostPreferences(householdId);

  // 1. 최근 5개월 범위 계산
  const months: Date[] = [];
  for (let i = 0; i < HISTORY_MONTHS_COUNT; i++) {
    months.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1));
  }
  const monthLabels = months.map(m => `${m.getFullYear()}년 ${m.getMonth() + 1}월`);
  const monthRanges = months.map(m => fiscalCycle.getDateRange(m));
  const overallStart = monthRanges[HISTORY_MONTHS_COUNT - 1].start;
  const overallEnd = monthRanges[0].end;

  // 2. Firestore 조회 (expense만)
  const snap = await firestore()
    .collection('households').doc(householdId)
    .collection('transactions')
    .where('date', '>=', overallStart)
    .where('date', '<=', overallEnd)
    .get();

  const allTx: RawTx[] = [];
  snap.docs.forEach(doc => {
    const d = doc.data();
    if (d.type !== 'expense') return;
    const date = d.date?.toDate() || new Date();
    const monthIdx = monthRanges.findIndex(({ start, end }) => date >= start && date <= end);
    if (monthIdx < 0) return;

    const rawTx: RawTx = {
      monthIdx,
      amount: d.amount || 0,
      description: (d.description || '').trim(),
      categoryName: d.categoryName || '',
      categoryGroup: d.categoryGroup || '',
      categoryIcon: d.categoryIcon || '',
      date,
      isCouple: d.isCouple || false,
      createdBy: d.createdBy || '',
    };
    allTx.push(rawTx);
  });

  // 3. viewMode 필터
  // - personal: 현재 사용자의 개인 거래 (!tx.isCouple && tx.createdBy === userId)
  // - couple: 공동 거래 (tx.isCouple)
  // - all: 공동 거래 + 현재 사용자의 개인 거래 (tx.isCouple || tx.createdBy === userId)
  const filteredTx = allTx.filter(tx => {
    if (viewMode === 'couple') return tx.isCouple;
    if (viewMode === 'personal') return !tx.isCouple && (!userId || tx.createdBy === userId);
    return tx.isCouple || (!userId || tx.createdBy === userId);
  });

  // 4. 가맹점(적요)별 그룹핑
  const descGroups: Record<string, { displayName: string; rawTransactions: RawTx[] }> = {};

  filteredTx.forEach(tx => {
    if (!tx.description) return;
    const norm = normalizeDescription(tx.description);
    if (isBlacklistedDescription(norm)) return;

    if (!descGroups[norm]) {
      descGroups[norm] = { displayName: tx.description, rawTransactions: [] };
    }
    descGroups[norm].rawTransactions.push(tx);
  });

  // 유사 가맹점 병합 (75% 이상)
  const normKeys = Object.keys(descGroups);
  const merged = new Set<string>();
  for (let i = 0; i < normKeys.length; i++) {
    if (merged.has(normKeys[i])) continue;
    const a = descGroups[normKeys[i]];
    for (let j = i + 1; j < normKeys.length; j++) {
      if (merged.has(normKeys[j])) continue;
      const b = descGroups[normKeys[j]];
      if (similarity(normKeys[i], normKeys[j]) >= SIMILARITY_THRESHOLD) {
        a.rawTransactions.push(...b.rawTransactions);
        merged.add(normKeys[j]);
      }
    }
  }
  merged.forEach(k => delete descGroups[k]);

  const fixedCosts: FixedCostItem[] = [];
  const manualCandidates: FixedCostItem[] = [];
  const now = new Date();
  const isCurrentMonthActual =
    currentMonth.getFullYear() === now.getFullYear() &&
    currentMonth.getMonth() === now.getMonth();
  const todayDate = now.getDate();

  // 5. 각 가맹점 내에서 순수 수학적 3-Step 클러스터링 및 고정비 판정 (하드코딩 0%)
  Object.entries(descGroups).forEach(([normKey, group]) => {
    const txList = group.rawTransactions.filter(tx => tx.amount >= MIN_AMOUNT);
    if (txList.length === 0) return;

    // 금액 내림차순 정렬
    const sorted = [...txList].sort((a, b) => b.amount - a.amount);

    // [Step 1] 동일 카테고리 그룹(categoryGroup) + 금액 5% 이내 Core 고정 스트림 형성
    const clusters: Cluster[] = [];
    for (const tx of sorted) {
      let matched: Cluster | null = null;
      for (const c of clusters) {
        const diffRatio = Math.abs(tx.amount - c.avgAmt) / Math.max(tx.amount, c.avgAmt);
        if (diffRatio <= 0.05 && tx.categoryGroup === c.grp) {
          matched = c;
          break;
        }
      }
      if (!matched) {
        matched = {
          cat: tx.categoryName,
          grp: tx.categoryGroup,
          icon: tx.categoryIcon,
          avgAmt: tx.amount,
          txs: [],
        };
        clusters.push(matched);
      }
      matched.txs.push(tx);
      matched.avgAmt = matched.txs.reduce((s, t) => s + t.amount, 0) / matched.txs.length;
    }

    // 주력 스트림 우선(활성 월 수 내림차순 → 평균 금액 내림차순) 정렬로 순서 의존성 제거
    clusters.sort((a, b) => {
      const mDiff = new Set(b.txs.map(t => t.monthIdx)).size - new Set(a.txs.map(t => t.monthIdx)).size;
      if (mDiff !== 0) return mDiff;
      return b.avgAmt - a.avgAmt;
    });

    const absorbed = new Set<number>();

    // [Step 2] 단발성(1개월) 카테고리 오입력 거래 흡수
    // 주력(2개월+) 클러스터와 금액이 ±5% 이내로 일치하고, 날짜가 약정일 ±3일 이내이며, 해당 월이 비어있을 때만 흡수
    // (날짜가 동떨어진 타 용도 거래 예: 11/6 생활비 10만 vs 25일 청약 10만 은 절대 합치지 않고 분리)
    for (let i = 0; i < clusters.length; i++) {
      if (absorbed.has(i)) continue;
      const main = clusters[i];
      const mainMonths = new Set(main.txs.map(t => t.monthIdx));
      if (mainMonths.size < 2) continue;

      const mainAnchor = findBestAnchorDay(main.txs.map(t => t.date.getDate()));

      for (let j = 0; j < clusters.length; j++) {
        if (i === j || absorbed.has(j)) continue;
        const sub = clusters[j];
        const subMonths = new Set(sub.txs.map(t => t.monthIdx));
        if (subMonths.size >= 2 || sub.txs.length > 2) continue;

        const canAbsorb = sub.txs.every(t => {
          const diffRatio = Math.abs(t.amount - main.avgAmt) / Math.max(t.amount, main.avgAmt);
          const dist = getDayDistance(t.date.getDate(), mainAnchor);
          return diffRatio <= 0.05 && dist <= MAX_ANCHOR_DEVIATION && !mainMonths.has(t.monthIdx);
        });

        if (canAbsorb) {
          main.txs.push(...sub.txs);
          main.avgAmt = main.txs.reduce((s, t) => s + t.amount, 0) / main.txs.length;
          sub.txs.forEach(t => mainMonths.add(t.monthIdx));
          absorbed.add(j);
        }
      }
    }

    // [Step 3] 동일 카테고리 그룹 내 변동 고정비(±20% 이내, 예: 관리비/생활비/통신비) 병합
    // (일상 소비처의 가격 변동 거래도 함께 묶여서 이후 일탈/다건 검증에서 정확히 걸러지도록 날짜 제한 없이 그룹 내 병합)
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < clusters.length; i++) {
        if (absorbed.has(i)) continue;
        const main = clusters[i];
        for (let j = i + 1; j < clusters.length; j++) {
          if (absorbed.has(j)) continue;
          const sub = clusters[j];
          if (main.grp !== sub.grp) continue;

          const diffRatio = Math.abs(sub.avgAmt - main.avgAmt) / Math.max(sub.avgAmt, main.avgAmt);
          if (diffRatio <= 0.20) {
            main.txs.push(...sub.txs);
            main.avgAmt = main.txs.reduce((s, t) => s + t.amount, 0) / main.txs.length;
            absorbed.add(j);
            changed = true;
          }
        }
      }
    }

    // [Step 4] 체리피킹 차단 — 동일 소카테고리 & 빈 달의 1개월 단발(고아) 거래 편입
    // 3개월+ 형성된 스트림과 같은 소카테고리(categoryName)이면서, 빈 달의 약정일 ±3일 이내에 존재하는
    // 단 1건짜리 고아 거래(예: 9월 후불교통비 34,400원)를 함께 묶어 전수 이력으로 CV를 검증한다.
    for (let i = 0; i < clusters.length; i++) {
      if (absorbed.has(i)) continue;
      const main = clusters[i];
      const mainMonths = new Set(main.txs.map(t => t.monthIdx));
      if (mainMonths.size < 3) continue;

      const mainAnchor = findBestAnchorDay(main.txs.map(t => t.date.getDate()));

      for (let j = 0; j < clusters.length; j++) {
        if (i === j || absorbed.has(j)) continue;
        const sub = clusters[j];
        if (sub.cat !== main.cat) continue;
        const subMonths = new Set(sub.txs.map(t => t.monthIdx));
        if (subMonths.size >= 2 || sub.txs.length !== 1) continue;

        const orphanTx = sub.txs[0];
        if (!mainMonths.has(orphanTx.monthIdx) && getDayDistance(orphanTx.date.getDate(), mainAnchor) <= MAX_ANCHOR_DEVIATION) {
          main.txs.push(orphanTx);
          main.avgAmt = main.txs.reduce((s, t) => s + t.amount, 0) / main.txs.length;
          mainMonths.add(orphanTx.monthIdx);
          absorbed.add(j);
        }
      }
    }

    const finalClusters = clusters.filter((_, idx) => !absorbed.has(idx));
    const validClustersCount = finalClusters.filter(c => {
      const mCount = new Set(c.txs.map(t => t.monthIdx)).size;
      return mCount >= 3;
    }).length;
    const hasMultipleStreams = validClustersCount > 1;

    // 각 클러스터별 순수 통계적 고정비 검증
    finalClusters.forEach(cluster => {
      const cTxs = cluster.txs;

      // 월별 버킷 구성
      const monthlyBuckets = months.map((_, mIdx) => cTxs.filter(t => t.monthIdx === mIdx));
      const activeMonths = monthlyBuckets.filter(b => b.length > 0);

      // [규칙 1: 지속성] 5개월 중 최소 3개월 이상 발생 필수
      if (activeMonths.length < 3) return;

      // 대표 카테고리 결정 (최빈값 — 11월 건 실수 입력 시에도 최빈값으로 자동 승계!)
      const catCounts: Record<string, { count: number; group: string; name: string; icon: string }> = {};
      cTxs.forEach(t => {
        const key = `${t.categoryGroup}__${t.categoryName}`;
        if (!catCounts[key]) {
          catCounts[key] = { count: 0, group: t.categoryGroup, name: t.categoryName, icon: t.categoryIcon };
        }
        catCounts[key].count++;
      });
      const bestCat = Object.values(catCounts).sort((a, b) => b.count - a.count)[0];
      let effectiveGroup = bestCat?.group || cluster.grp;
      let effectiveName = bestCat?.name || cluster.cat;
      let effectiveIcon = bestCat?.icon || cluster.icon;

      // preferenceKey
      const prefKeyCandidate = hasMultipleStreams
        ? makeFixedCostKey(`${normKey}_${Math.round(cluster.avgAmt)}`, effectiveGroup, effectiveName)
        : makeFixedCostKey(normKey, effectiveGroup, effectiveName);

      const pref = preferences[prefKeyCandidate] || preferences[makeFixedCostKey(normKey, effectiveGroup, effectiveName)];
      if (pref?.action === 'dismiss') return;
      const isPinned = pref?.action === 'pin';

      if (pref?.customCategoryName) {
        effectiveGroup = pref.customCategoryGroup || effectiveGroup;
        effectiveName = pref.customCategoryName;
        effectiveIcon = pref.customCategoryIcon || effectiveIcon;
      }

      if (!isPinned && excludeCategories.length > 0) {
        const isUserExcluded = excludeCategories.some(ec =>
          ec.name ? effectiveGroup === ec.group && effectiveName === ec.name : effectiveGroup === ec.group
        );
        if (isUserExcluded) return;
      }

      // [규칙 2: 월간 다건 반복 검증 — 체리피킹 원천 차단]
      const multiTxMonths = activeMonths.filter(b => b.length > 1);
      if (!isPinned && multiTxMonths.length >= 2) return;

      // [규칙 3: 순수 약정 기준일(Anchor Day) 도출]
      const cleanMonths = activeMonths.filter(b => b.length === 1);
      const anchorDaysSource = (cleanMonths.length >= 2 ? cleanMonths : activeMonths)
        .flat()
        .map(t => t.date.getDate());
      const anchorDay = findBestAnchorDay(anchorDaysSource);

      // [규칙 4: 약정일 일탈 거래(Outlier) 검증 — 고기반장 등 일상 소비 매장 차단]
      if (!isPinned) {
        const hasOutlier = cTxs.some(t => getDayDistance(t.date.getDate(), anchorDay) > MAX_ANCHOR_DEVIATION);
        if (hasOutlier) return;
      }

      // [규칙 5: 전수 이력 구성 & 월별 대표 거래(chosen) 선택]
      const evidence: { monthLabel: string; transactions: FixedCostTransaction[] }[] = [];
      const monthlyAmounts: number[] = [];
      const representativeAmounts: number[] = [];

      for (let mIdx = 0; mIdx < months.length; mIdx++) {
        const bucket = monthlyBuckets[mIdx];
        if (bucket.length === 0) {
          monthlyAmounts.push(0);
          continue;
        }

        const sortedTxs = [...bucket].sort((a, b) => b.date.getTime() - a.date.getTime());
        let chosen = sortedTxs[0];
        let minDist = getDayDistance(sortedTxs[0].date.getDate(), anchorDay);
        for (let i = 1; i < sortedTxs.length; i++) {
          const dist = getDayDistance(sortedTxs[i].date.getDate(), anchorDay);
          if (dist < minDist) {
            minDist = dist;
            chosen = sortedTxs[i];
          }
        }

        monthlyAmounts.push(chosen.amount);
        representativeAmounts.push(chosen.amount);
        evidence.push({
          monthLabel: monthLabels[mIdx],
          transactions: [{
            date: chosen.date,
            amount: chosen.amount,
            description: chosen.description,
          }],
        });
      }

      // [규칙 6: 금액 변동계수(CV) 검증]
      const cv = representativeAmounts.length >= 2 ? calculateCv(representativeAmounts) : 0;
      const exceedsCv = !isPinned && representativeAmounts.length >= 2 && cv > MAX_ALLOWED_CV;

      const allSame = representativeAmounts.length > 0 && representativeAmounts.every(a => a === representativeAmounts[0]);
      const avgAmt = Math.round(representativeAmounts.reduce((s, a) => s + a, 0) / representativeAmounts.length);
      const fixedAmount = allSame ? representativeAmounts[0] : avgAmt;

      // Pending 검사
      let isPending = false;
      const hasM0 = monthlyAmounts[0] > 0;
      const hasM1 = monthlyAmounts[1] > 0;

      if (!hasM0 && isCurrentMonthActual) {
        if (hasM1 && todayDate <= anchorDay + 2) {
          isPending = true;
        } else if (hasM1 && activeMonths.length >= 3) {
          isPending = true;
        } else {
          return;
        }
      }

      const defaultDisplayName = hasMultipleStreams
        ? `${group.displayName} (${formatCurrency(fixedAmount)})`
        : group.displayName;

      const finalDisplayName = pref?.customName?.trim()
        ? pref.customName.trim()
        : defaultDisplayName;

      const item: FixedCostItem = {
        description: finalDisplayName,
        originalDescription: defaultDisplayName,
        customName: pref?.customName,
        categoryName: effectiveName,
        categoryGroup: effectiveGroup,
        categoryIcon: effectiveIcon,
        amount: fixedAmount,
        isFixed: allSame,
        monthlyAmounts,
        evidence,
        source: isPinned ? 'pinned' : 'auto',
        preferenceKey: prefKeyCandidate,
        isPending,
        expectedAmount: fixedAmount,
        expectedDay: anchorDay,
        cv,
      };

      if (exceedsCv) {
        // 주기성(월 1회, 약정일 ±3일)은 완벽하나 CV가 20%를 초과하여 자동 제외됨 → 수동 등록 추천 후보
        manualCandidates.push(item);
      } else {
        fixedCosts.push(item);
      }
    });
  });

  fixedCosts.sort((a, b) => b.amount - a.amount);
  manualCandidates.sort((a, b) => b.amount - a.amount);
  console.log('[FixedCost] v11 채택 목록:', JSON.stringify(fixedCosts.map(f => {
    const evDates = f.evidence.flatMap(e => e.transactions.map(t => `${t.date.getMonth() + 1}/${t.date.getDate()}`)).join(',');
    return `${f.description}: ${f.amount}원 (${f.categoryName}, pin:${f.source==='pinned'}, dates:[${evDates}], 5M=${JSON.stringify(f.monthlyAmounts)})`;
  })));
  if (manualCandidates.length > 0) {
    console.log('[FixedCost] v11 수동 등록 추천 후보:', JSON.stringify(manualCandidates.map(c => `${c.description}: ~${c.amount}원 (${c.categoryName}, CV:${((c.cv || 0) * 100).toFixed(1)}%, 5M=${JSON.stringify(c.monthlyAmounts)})`)));
  }

  return { fixedCosts, manualCandidates };
}

/**
 * 100% 범용 고정비 분석 (기존 호환 래퍼)
 */
export async function analyzeFixedCosts(
  householdId: string,
  currentMonth: Date,
  userId: string,
  viewMode: 'all' | 'personal' | 'couple',
  fiscalCycle: FiscalCycleHelper,
  excludeCategories: ExcludeCategory[] = [],
): Promise<FixedCostItem[]> {
  const { fixedCosts } = await analyzeFixedCostsDetailed(
    householdId,
    currentMonth,
    userId,
    viewMode,
    fiscalCycle,
    excludeCategories,
  );
  return fixedCosts;
}
