/**
 * PairBudget 통계 화면
 * 월별 막대그래프, 카테고리 순위, 수입/지출 비교, 멤버 분담 비교
 * Firestore 실시간 데이터 연동
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Modal,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, { Path, Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Stop, Line as SvgLine, Rect, G, Text as SvgText } from 'react-native-svg';
import CategoryIcon from '../../components/CategoryIcon';
import { Colors } from '../../theme/colors';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { GlassCard } from '../../components/GlassCard';
import { formatCurrency, formatCompactCurrency } from '../../utils/formatCurrency';
import { getYearMonth, getStartOfMonth, getEndOfMonth, getMonthLabel } from '../../utils/dateUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useHousehold } from '../../contexts/HouseholdContext';
import { useMonth } from '../../contexts/MonthContext';
import { useFiscalCycle } from '../../contexts/FiscalCycleContext';
import { getBankInfo } from '../../utils/BankInfo';
import { formatCategoryLabel } from '../../utils/formatCategory';
import type { Transaction } from '../../types';
import { useNavigation } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface MonthlyData {
  yearMonth: string;
  label: string;
  expense: number;
  income: number;
}

interface SubCategoryRank {
  name: string;
  total: number;
}

interface CategoryRank {
  name: string;
  icon: string;
  total: number;
  color: string;
  subcategories: SubCategoryRank[];
}



const GROUP_ICONS: Record<string, string> = {
  '식비': 'restaurant-outline',
  '교통': 'bus-outline',
  '쇼핑': 'bag-outline',
  '주거/생활': 'home-outline',
  '문화/여가': 'film-outline',
  '의료/건강': 'medical-outline',
  '교육': 'school-outline',
  '경조사': 'heart-outline',
  '금융': 'shield-checkmark-outline',
  '반려동물': 'paw-outline',
  '기타': 'ellipsis-horizontal-outline',
  '급여': 'wallet-outline',
  '부수입': 'gift-outline',
};

const GROUP_COLORS: Record<string, string> = {
  '식비': '#FF6B6B',
  '교통': '#74B9FF',
  '쇼핑': '#FD79A8',
  '주거/생활': '#00CEC9',
  '문화/여가': '#A29BFE',
  '의료/건강': '#55EFC4',
  '교육': '#81ECEC',
  '경조사': '#FAB1A0',
  '금융': '#B2BEC3',
  '반려동물': '#FFEAA7',
  '기타': '#DFE6E9',
  '급여': '#00b894',
  '부수입': '#0984e3',
};

// ─── Animated Bar ────────────────────────────────────────────────────────────

const AnimatedBar: React.FC<{
  height: number;
  color: string;
  delay: number;
  maxHeight: number;
}> = ({ height, color, delay, maxHeight }) => {
  const animHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animHeight, {
      toValue: height,
      duration: 800,
      delay,
      useNativeDriver: false,
    }).start();
  }, [height, delay, animHeight]);

  return (
    <Animated.View
      style={[
        styles.barFill,
        {
          height: animHeight,
          backgroundColor: color,
          maxHeight,
        },
      ]}
    />
  );
};

// ─── Helper: get last N months as Date objects ──────────────────────────────

function getLastNMonths(n: number, baseDate: Date): Date[] {
  const months: Date[] = [];
  // 선택된 월을 4번째(index 3)에 놓고, 앞에 3개 뒤에 2개 표시
  // 단, 미래 월은 표시하지 않음
  const now = new Date();
  const currentYM = now.getFullYear() * 12 + now.getMonth();
  const baseYM = baseDate.getFullYear() * 12 + baseDate.getMonth();
  const futureMonths = currentYM - baseYM; // 선택월 뒤에 표시할 수 있는 월 수
  const after = Math.min(2, futureMonths); // 뒤에 최대 2개
  const before = n - 1 - after; // 앞에 나머지
  for (let i = before; i >= -after; i--) {
    months.push(new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1));
  }
  return months;
}

// ─── Stats Screen ────────────────────────────────────────────────────────────

const StatsScreen: React.FC = () => {
  const { user } = useAuth();
  const { household, categories } = useHousehold();
  const navigation = useNavigation<any>();

  const { currentMonth, setCurrentMonth, monthPickerVisible, setMonthPickerVisible, pickerYear, setPickerYear } = useMonth();
  const fiscalCycle = useFiscalCycle();

  const [currentMonthTx, setCurrentMonthTx] = useState<Transaction[]>([]);
  const [rawMonthlyTx, setRawMonthlyTx] = useState<{yearMonth: string; isCouple: boolean; createdBy: string; type: string; amount: number}[]>([]);
  const [monthlyMonths, setMonthlyMonths] = useState<Date[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [coupleFilter, setCoupleFilter] = useState<'all' | 'personal' | 'couple'>('personal');
  const [typeFilter, setTypeFilter] = useState<'expense' | 'income'>('expense');
  const [selectedPieIndex, setSelectedPieIndex] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedGroupForDetail, setSelectedGroupForDetail] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [isLoadingTrend, setIsLoadingTrend] = useState(false);
  const [detailFilter, setDetailFilter] = useState<'all' | 'personal' | 'couple'>('personal');
  const [rawTrendDocs, setRawTrendDocs] = useState<{amount: number; isCouple: boolean; createdBy: string; ym: string; categoryName: string}[]>([]);
  const [trendMonths, setTrendMonths] = useState<Date[]>([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // ─── Listener for current month transactions ──────────────────────────────

  useEffect(() => {
    if (!user?.householdId) {
      setCurrentMonthTx([]);
      return;
    }

    const { start, end } = fiscalCycle.getDateRange(currentMonth);

    const unsub = firestore()
      .collection('households').doc(user.householdId)
      .collection('transactions')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .orderBy('date', 'desc')
      .onSnapshot(
        snap => {
          const list: Transaction[] = snap.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              amount: d.amount || 0,
              type: d.type || 'expense',
              categoryId: d.categoryId || '',
              categoryName: d.categoryName || '',
              categoryIcon: d.categoryIcon || '',
              description: d.description || '',
              date: d.date?.toDate() || new Date(),
              createdBy: d.createdBy || '',
              createdByName: d.createdByName || '',
              source: d.source || 'manual',
              cardIssuer: d.cardIssuer || undefined,
              categoryGroup: d.categoryGroup || undefined,
              isCouple: d.isCouple || false,
              memo: d.memo || '',
              createdAt: d.createdAt?.toDate() || new Date(),
              updatedAt: d.updatedAt?.toDate() || new Date(),
            };
          });
          setCurrentMonthTx(list);
          setIsLoading(false);
        },
        err => {
          console.error('Stats TX listener:', err);
          setIsLoading(false);
        },
      );

    return () => unsub();
  }, [user?.householdId, currentMonth, fiscalCycle.enabled, fiscalCycle.startDay]);

  // ─── Fetch last 6 months of data for bar chart ────────────────────────────

  useEffect(() => {
    if (!user?.householdId) {
      setRawMonthlyTx([]);
      setMonthlyMonths([]);
      return;
    }

    const months = getLastNMonths(6, currentMonth);
    setMonthlyMonths(months);
    const overallStart = fiscalCycle.getDateRange(months[0]).start;
    const overallEnd = fiscalCycle.getDateRange(months[months.length - 1]).end;

    const unsub = firestore()
      .collection('households').doc(user.householdId)
      .collection('transactions')
      .where('date', '>=', overallStart)
      .where('date', '<=', overallEnd)
      .orderBy('date', 'desc')
      .onSnapshot(
        snap => {
          const txList = snap.docs.map(doc => {
            const d = doc.data();
            const txDate: Date = d.date?.toDate() || new Date();
            return {
              yearMonth: getYearMonth(txDate),
              isCouple: d.isCouple === true,
              createdBy: d.createdBy || '',
              type: d.type || 'expense',
              amount: d.amount || 0,
            };
          }).filter(t => t.isCouple || t.createdBy === user?.uid);
          setRawMonthlyTx(txList);
        },
        err => {
          console.error('Stats monthly listener:', err);
        },
      );

    return () => unsub();
  }, [user?.householdId, currentMonth, fiscalCycle.enabled, fiscalCycle.startDay]);

  // ─── Fetch 6-month trend for selected category group ────────────────────────

  useEffect(() => {
    if (!selectedGroupForDetail || !user?.householdId) {
      setRawTrendDocs([]);
      setTrendMonths([]);
      return;
    }
    setDetailFilter(coupleFilter);
    setSelectedSubCategory(null);

    setIsLoadingTrend(true);
    const months = getLastNMonths(6, currentMonth);
    const overallStart = fiscalCycle.getDateRange(months[0]).start;
    const overallEnd = fiscalCycle.getDateRange(months[months.length - 1]).end;

    const unsub = firestore()
      .collection('households').doc(user.householdId)
      .collection('transactions')
      .where('date', '>=', overallStart)
      .where('date', '<=', overallEnd)
      .orderBy('date', 'desc')
      .onSnapshot(
        snap => {
          const docs: {amount: number; isCouple: boolean; createdBy: string; ym: string}[] = [];

          snap.docs.forEach(doc => {
            const d = doc.data();
            if (d.type !== typeFilter) return;
            const isCouple = d.isCouple === true;
            const isMine = d.createdBy === user?.uid;
            if (!isCouple && !isMine) return;

            const cat = categories.find(c => c.name === d.categoryName || c.id === d.categoryId);
            const group = d.categoryGroup || cat?.group || d.categoryName || d.categoryId || '기타';
            if (group !== selectedGroupForDetail) return;

            const txDate: Date = d.date?.toDate() || new Date();
            const ym = getYearMonth(txDate);
            docs.push({ amount: d.amount || 0, isCouple, createdBy: d.createdBy || '', ym, categoryName: d.categoryName || '' });
          });

          setRawTrendDocs(docs);
          setTrendMonths(months);
          setIsLoadingTrend(false);
        },
        err => {
          console.error('Group trend listener:', err);
          setIsLoadingTrend(false);
        },
      );

    return () => unsub();
  }, [selectedGroupForDetail, user?.householdId, user?.uid, currentMonth, categories, typeFilter, fiscalCycle.enabled, fiscalCycle.startDay]);

  // ─── Computed values ──────────────────────────────────────────────────────

  const currentYearMonth = getYearMonth(currentMonth);

  // monthlyData: coupleFilter 적용된 6개월 막대그래프 데이터
  const monthlyData = useMemo(() => {
    if (monthlyMonths.length === 0) return [];
    const buckets: Record<string, { expense: number; income: number }> = {};
    monthlyMonths.forEach(m => {
      buckets[getYearMonth(m)] = { expense: 0, income: 0 };
    });
    rawMonthlyTx.forEach(t => {
      if (coupleFilter === 'personal' && (t.isCouple || t.createdBy !== user?.uid)) return;
      if (coupleFilter === 'couple' && !t.isCouple) return;
      if (buckets[t.yearMonth]) {
        if (t.type === 'expense') buckets[t.yearMonth].expense += t.amount;
        else if (t.type === 'income') buckets[t.yearMonth].income += t.amount;
      }
    });
    return monthlyMonths.map(m => {
      const ym = getYearMonth(m);
      return { yearMonth: ym, label: getMonthLabel(ym), expense: buckets[ym].expense, income: buckets[ym].income };
    });
  }, [rawMonthlyTx, monthlyMonths, coupleFilter, user?.uid]);

  const maxChartValue = Math.max(...monthlyData.map(d => typeFilter === 'expense' ? d.expense : d.income), 1);

  const filteredTx = useMemo(() => {
    if (coupleFilter === 'personal') return currentMonthTx.filter(t => !t.isCouple && t.createdBy === user?.uid);
    if (coupleFilter === 'couple') return currentMonthTx.filter(t => t.isCouple);
    return currentMonthTx.filter(t => t.isCouple || t.createdBy === user?.uid);
  }, [currentMonthTx, coupleFilter, user?.uid]);

  // Detail modal: filter from full dataset by detailFilter (independent of main coupleFilter)
  const detailFilteredTx = useMemo(() => {
    if (detailFilter === 'personal') return currentMonthTx.filter(t => !t.isCouple && t.createdBy === user?.uid);
    if (detailFilter === 'couple') return currentMonthTx.filter(t => t.isCouple);
    return currentMonthTx.filter(t => t.isCouple || t.createdBy === user?.uid);
  }, [currentMonthTx, detailFilter, user?.uid]);

  // Derive trend data from raw docs with detailFilter applied
  const groupMonthlyTrendFiltered = useMemo(() => {
    const filtered = rawTrendDocs.filter(d => {
      if (detailFilter === 'personal') return !d.isCouple && d.createdBy === user?.uid;
      if (detailFilter === 'couple') return d.isCouple;
      return true;
    }).filter(d => {
      if (selectedSubCategory) return d.categoryName === selectedSubCategory;
      return true;
    });
    const buckets: Record<string, number> = {};
    trendMonths.forEach(m => { buckets[getYearMonth(m)] = 0; });
    filtered.forEach(d => {
      if (buckets[d.ym] !== undefined) buckets[d.ym] += d.amount;
    });
    return trendMonths.map(m => {
      const ym = getYearMonth(m);
      return { month: ym, label: getMonthLabel(ym), amount: buckets[ym] };
    });
  }, [rawTrendDocs, trendMonths, detailFilter, user?.uid, selectedSubCategory]);

  const currentData = useMemo(() => {
    const totalExpense = filteredTx
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    const totalIncome = filteredTx
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);

    return { expense: totalExpense, income: totalIncome };
  }, [filteredTx]);

  // Category rankings from filtered transactions (Grouped by main category)
  const categoryRankings: CategoryRank[] = useMemo(() => {
    const catMap: Record<string, { name: string; icon: string; total: number; color: string; subMap: Record<string, number> }> = {};

    filteredTx
      .filter(t => t.type === typeFilter)
      .forEach(t => {
        const cat = categories.find(c => c.name === t.categoryName || c.id === t.categoryId);
        const group = t.categoryGroup || cat?.group || t.categoryName || t.categoryId || '기타';
        const subName = t.categoryName || t.categoryId || '기타';

        if (!catMap[group]) {
          catMap[group] = {
            name: group,
            icon: GROUP_ICONS[group] || cat?.icon || 'cash-outline',
            total: 0,
            color: GROUP_COLORS[group] || cat?.color || '#B2BEC3',
            subMap: {},
          };
        }
        
        catMap[group].total += t.amount;
        catMap[group].subMap[subName] = (catMap[group].subMap[subName] || 0) + t.amount;
      });

    return Object.values(catMap).map(g => {
      const subs = Object.entries(g.subMap)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);
      
      return {
        name: g.name,
        icon: g.icon,
        total: g.total,
        color: g.color,
        subcategories: subs,
      };
    }).sort((a, b) => b.total - a.total);
  }, [filteredTx, categories, typeFilter]);




  const totalAllCategories = categoryRankings.reduce(
    (sum, c) => sum + c.total,
    0,
  );

  const BAR_MAX_HEIGHT = 120;

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const getMedalEmoji = (rank: number): string => {
    return `${rank + 1}`;
  };

  const monthDisplay = fiscalCycle.getMonthDisplayLabel(currentMonth);

  // ─── Loading state ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
        <ActivityIndicator size="large" color={Colors.Primary} />
        <Text style={{ marginTop: Spacing.md, color: Colors.TextSecondary, fontSize: 14 }}>
          데이터 불러오는 중...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {}}
            tintColor={Colors.Primary}
            colors={[Colors.Primary]}
          />
        }
      >
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.monthPicker}>
            <TouchableOpacity onPress={handlePrevMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Icon name="chevron-back" size={22} color={Colors.Primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPickerYear(currentMonth.getFullYear()); setMonthPickerVisible(true); }}>
              <Text style={styles.monthLabel}>{monthDisplay}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNextMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Icon name="chevron-forward" size={22} color={Colors.Primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Couple Filter (맨 위) ─── */}
        <View style={styles.coupleFilterRow}>
          {([['personal', '개인'], ['couple', '공동'], ['all', '전체']] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.coupleFilterChip, coupleFilter === key && styles.coupleFilterChipActive]}
              onPress={() => setCoupleFilter(key)}
            >
              <Text style={[styles.coupleFilterText, coupleFilter === key && styles.coupleFilterTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Type Filter (지출/수입) ─── */}
        <View style={[styles.coupleFilterRow, { marginTop: 0 }]}>
          {([['expense', '지출'], ['income', '수입']] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.coupleFilterChip, typeFilter === key && styles.coupleFilterChipActive]}
              onPress={() => setTypeFilter(key)}
            >
              <Text style={[styles.coupleFilterText, typeFilter === key && styles.coupleFilterTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Monthly Bar Chart ─── */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <GlassCard style={styles.chartCard}>
            <View style={styles.sectionHeaderRow}>
              <Icon name="bar-chart-outline" size={20} color={Colors.Primary} style={styles.sectionHeaderIcon} />
              <Text style={styles.sectionTitle}>월별 {typeFilter === 'expense' ? '지출' : '수입'} 추이</Text>
            </View>
            <Text style={styles.sectionSubtitle}>최근 6개월 막대그래프</Text>

            {monthlyData.length > 0 ? (
              <View style={styles.chartContainer}>
                {/* Y-axis labels */}
                <View style={[styles.yAxis, { height: BAR_MAX_HEIGHT }]}>
                  <Text style={[styles.yLabel, { position: 'absolute', top: -6, right: 8 }]}>
                    {formatCompactCurrency(maxChartValue)}
                  </Text>
                  <Text style={[styles.yLabel, { position: 'absolute', top: BAR_MAX_HEIGHT / 2 - 6, right: 8 }]}>
                    {formatCompactCurrency(Math.round(maxChartValue / 2))}
                  </Text>
                  <Text style={[styles.yLabel, { position: 'absolute', top: BAR_MAX_HEIGHT - 6, right: 8 }]}>
                    0
                  </Text>
                </View>

                {/* Bars */}
                <View style={styles.barsContainer}>
                  {/* Grid lines */}
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: BAR_MAX_HEIGHT }}>
                    <View style={[styles.gridLine, { top: 0 }]} />
                    <View style={[styles.gridLine, { top: BAR_MAX_HEIGHT / 2 }]} />
                    <View style={[styles.gridLine, { top: BAR_MAX_HEIGHT }]} />
                  </View>

                  <View style={styles.barsRow}>
                    {monthlyData.map((month, index) => {
                      const value = typeFilter === 'expense' ? month.expense : month.income;
                      const barHeight =
                        maxChartValue > 0
                          ? (value / maxChartValue) * BAR_MAX_HEIGHT
                          : 0;
                      const isCurrent = month.yearMonth === currentYearMonth;
                      const barColor = isCurrent
                        ? typeFilter === 'expense' ? Colors.Primary : Colors.Accent
                        : Colors.TextMuted;

                      return (
                        <TouchableOpacity
                          key={month.yearMonth}
                          style={styles.barColumn}
                          onPress={() =>
                            setCurrentMonth(
                              new Date(
                                parseInt(month.yearMonth.split('-')[0], 10),
                                parseInt(month.yearMonth.split('-')[1], 10) - 1,
                                1,
                              ),
                            )
                          }
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.barWrapper,
                              { height: BAR_MAX_HEIGHT },
                            ]}
                          >
                            <AnimatedBar
                              height={barHeight}
                              color={barColor}
                              delay={index * 100}
                              maxHeight={BAR_MAX_HEIGHT}
                            />
                          </View>
                          <Text
                            style={[
                              styles.barLabel,
                              isCurrent && { color: Colors.Primary, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {month.label}
                          </Text>
                          <Text
                            style={[
                              styles.barAmount,
                              isCurrent && { color: Colors.Text },
                            ]}
                          >
                            {formatCompactCurrency(value)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>데이터가 없습니다</Text>
              </View>
            )}
          </GlassCard>
        </Animated.View>



        {/* ─── Pie Chart ─── */}
        {categoryRankings.length > 0 && (
          <GlassCard style={styles.rankingCard}>
            <View style={styles.sectionHeaderRow}>
              <Icon name="pie-chart-outline" size={20} color={Colors.Primary} style={styles.sectionHeaderIcon} />
              <Text style={styles.sectionTitle}>카테고리별 비율</Text>
              <View style={{flex: 1}} />
              <Text style={{fontSize: 15, fontWeight: '800', color: Colors.Text}}>{formatCurrency(totalAllCategories)}</Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md}}>
              {/* SVG Donut Chart */}
              <View style={{width: 160, height: 160, marginRight: Spacing.md}}>
                <Svg width={160} height={160} viewBox="0 0 160 160">
                  {(() => {
                    const cx = 80, cy = 80, r = 70;
                    let startAngle = -90;
                    const slices: any[] = [];

                    categoryRankings.forEach((cat, i) => {
                      const angle = Math.min((cat.total / totalAllCategories) * 360, 359.99);
                      if (angle <= 0) return;
                      
                      const endAngle = startAngle + angle;
                      const largeArc = angle > 180 ? 1 : 0;
                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = (endAngle * Math.PI) / 180;
                      const x1 = cx + r * Math.cos(startRad);
                      const y1 = cy + r * Math.sin(startRad);
                      const x2 = cx + r * Math.cos(endRad);
                      const y2 = cy + r * Math.sin(endRad);
                      const isSelected = selectedPieIndex === i;
                      const isAnySelected = selectedPieIndex !== null;
                      const d = [
                        `M ${cx} ${cy}`,
                        `L ${x1} ${y1}`,
                        `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
                        'Z',
                      ].join(' ');

                      // 선택된 조각을 중심에서 바깥으로 8px 밀어내기 (explode)
                      const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
                      const explodeDistance = isSelected ? 8 : 0;
                      const tx = explodeDistance * Math.cos(midAngle);
                      const ty = explodeDistance * Math.sin(midAngle);

                      slices.push(
                        <Path
                          key={`pie-${i}`}
                          d={d}
                          fill={cat.color}
                          opacity={!isAnySelected || isSelected ? 1 : 0.3}
                          transform={`translate(${tx}, ${ty})`}
                          onPress={() => setSelectedPieIndex(selectedPieIndex === i ? null : i)}
                        />
                      );
                      startAngle = endAngle;
                    });
                    return slices;
                  })()}
                </Svg>
              </View>
              {/* Legend */}
              <View style={{flex: 1}}>
                {categoryRankings.slice(0, 5).map((cat, i) => (
                  <TouchableOpacity
                    key={`legend-${i}`}
                    style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6, opacity: selectedPieIndex === null || selectedPieIndex === i ? 1 : 0.4}}
                    onPress={() => setSelectedPieIndex(selectedPieIndex === i ? null : i)}
                    activeOpacity={0.7}
                  >
                    <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color, marginRight: 8}} />
                    <Text style={{fontSize: 12, color: Colors.Text, flex: 1}} numberOfLines={1}>{cat.name}</Text>
                    <Text style={{fontSize: 12, fontWeight: '600', color: Colors.TextSecondary}}>
                      {totalAllCategories > 0 ? ((cat.total / totalAllCategories) * 100).toFixed(0) : 0}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </GlassCard>
        )}

        {/* ─── Category Ranking ─── */}
        <GlassCard style={styles.rankingCard}>
          <View style={styles.sectionHeaderRow}>
            <Icon name={typeFilter === 'expense' ? 'trending-down-outline' : 'trending-up-outline'} size={20} color={typeFilter === 'expense' ? Colors.Primary : Colors.Accent} style={styles.sectionHeaderIcon} />
            <Text style={styles.sectionTitle}>{typeFilter === 'expense' ? '지출' : '수입'} TOP</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            이번 달 카테고리별 {typeFilter === 'expense' ? '지출' : '수입'} 순위
          </Text>

          {categoryRankings.length > 0 ? (
            categoryRankings.map((cat, index) => {
              const pct = totalAllCategories > 0
                ? (cat.total / totalAllCategories) * 100
                : 0;
              const isTop3 = index < 3;

              const isExpanded = expandedGroup === cat.name;

              return (
                <View key={`rank-${cat.name}-${index}`}>
                  <TouchableOpacity
                    style={styles.rankItem}
                    onPress={() => setSelectedGroupForDetail(cat.name)}
                    onLongPress={() => setExpandedGroup(isExpanded ? null : cat.name)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rankLeft}>
                      <Text
                        style={[
                          styles.rankNumber,
                          isTop3 && styles.rankNumberTop3,
                        ]}
                      >
                        {getMedalEmoji(index)}
                      </Text>
                      <View
                        style={[
                          styles.rankIcon,
                          { backgroundColor: `${cat.color}20` },
                        ]}
                      >
                        <CategoryIcon icon={cat.icon} categoryName={cat.name} size={16} color={cat.color} />
                      </View>
                      <Text style={styles.rankName}>{cat.name}</Text>
                      {cat.subcategories && cat.subcategories.length > 0 && (
                        <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={Colors.TextMuted} style={{marginLeft: 4}} />
                      )}
                    </View>
                    <View style={styles.rankRight}>
                      <View style={styles.rankBarContainer}>
                        <Animated.View
                          style={[
                            styles.rankBar,
                            {
                              width: `${pct}%` as any,
                              backgroundColor: cat.color,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.rankAmount}>
                        {formatCurrency(cat.total)}
                      </Text>
                      <Text style={styles.rankPct}>{pct.toFixed(0)}%</Text>
                    </View>
                  </TouchableOpacity>

                  {/* 서브 카테고리 표시 */}
                  {isExpanded && cat.subcategories && cat.subcategories.length > 0 && (
                    <View style={styles.subCategoriesContainer}>
                      {cat.subcategories.map((sub, subIdx) => {
                        const subPct = cat.total > 0 ? (sub.total / cat.total) * 100 : 0;
                        return (
                          <View key={`sub-${sub.name}-${subIdx}`} style={styles.subCategoryItem}>
                            <View style={styles.subCategoryLeft}>
                              <View style={styles.subCategoryBullet} />
                              <Text style={styles.subCategoryName}>{sub.name === cat.name ? '기타/기본' : sub.name}</Text>
                            </View>
                            <View style={styles.subCategoryRight}>
                              <Text style={styles.subCategoryAmount}>{formatCurrency(sub.total)}</Text>
                              <Text style={styles.subCategoryPct}>{subPct.toFixed(0)}%</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptyText}>이번 달 지출 내역이 없어요</Text>
            </View>
          )}
        </GlassCard>

        {/* ─── Income vs Expense ─── */}
        <GlassCard style={styles.comparisonCard}>
          <View style={styles.sectionHeaderRow}>
            <Icon name="swap-horizontal-outline" size={20} color={Colors.Primary} style={styles.sectionHeaderIcon} />
            <Text style={styles.sectionTitle}>수입 vs 지출</Text>
          </View>

                    {(currentData.income > 0 || currentData.expense > 0) ? (
            (() => {
              const maxVal = Math.max(currentData.income, currentData.expense);
              const incomeWidth = maxVal > 0 ? (currentData.income / maxVal) * 100 : 0;
              const expenseWidth = maxVal > 0 ? (currentData.expense / maxVal) * 100 : 0;
              
              return (
              <>
                <View style={styles.comparisonBars}>
                  {/* Income bar */}
                  <View style={styles.comparisonBarItem}>
                    <Text style={styles.comparisonLabel}>수입</Text>
                    <View style={styles.comparisonBarBg}>
                      <View
                        style={[
                          styles.comparisonBarFill,
                          {
                            width: `${incomeWidth}%` as any,
                            backgroundColor: Colors.Income,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.comparisonAmount, { color: Colors.Income }]}>
                      {formatCurrency(currentData.income)}
                    </Text>
                  </View>

                  {/* Expense bar */}
                  <View style={styles.comparisonBarItem}>
                    <Text style={styles.comparisonLabel}>지출</Text>
                    <View style={styles.comparisonBarBg}>
                      <View
                        style={[
                          styles.comparisonBarFill,
                          {
                            width: `${expenseWidth}%` as any,
                            backgroundColor: Colors.Expense,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.comparisonAmount, { color: Colors.Expense }]}>
                      {formatCurrency(currentData.expense)}
                    </Text>
                  </View>
                </View>
              </>
              );
            })()
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptyText}>이번 달 거래 내역이 없어요</Text>
            </View>
          )}
        </GlassCard>



        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {/* ─── Category Detail Modal ─── */}
      <Modal
        visible={selectedGroupForDetail !== null}
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => setSelectedGroupForDetail(null)}
      >
        {(() => {
          const group = categoryRankings.find(c => c.name === selectedGroupForDetail);
          if (!group) return (
            <View style={detailStyles.container}>
              <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
              <View style={[detailStyles.header, {paddingTop: (StatusBar.currentHeight || 24) + 12}]}>
                <TouchableOpacity
                  onPress={() => setSelectedGroupForDetail(null)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Icon name="arrow-back" size={24} color={Colors.Text} />
                </TouchableOpacity>
                <View style={[detailStyles.headerLeft, {flex: 1, marginLeft: 8}]}>
                  <View style={[detailStyles.headerIconWrap, { backgroundColor: `${Colors.TextMuted}20`, width: 36, height: 36, borderRadius: 18 }]}>
                    <Icon name="analytics-outline" size={18} color={Colors.TextMuted} />
                  </View>
                  <View>
                    <Text style={detailStyles.headerTitle}>{selectedGroupForDetail}</Text>
                    <Text style={detailStyles.headerSubtitle}>상세 분석</Text>
                  </View>
                </View>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <TouchableOpacity
                    onPress={() => {
                      const prev = new Date(currentMonth);
                      prev.setMonth(prev.getMonth() - 1);
                      setCurrentMonth(prev);
                    }}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                  >
                    <Icon name="chevron-back" size={18} color={Colors.Primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setPickerYear(currentMonth.getFullYear());
                      setMonthPickerVisible(true);
                    }}
                  >
                    <Text style={{fontSize: 13, fontWeight: '700', color: Colors.Primary}}>{monthDisplay}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const next = new Date(currentMonth);
                      next.setMonth(next.getMonth() + 1);
                      const now = new Date();
                      if (next <= new Date(now.getFullYear(), now.getMonth(), 1)) {
                        setCurrentMonth(next);
                      }
                    }}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                  >
                    <Icon name="chevron-forward" size={18} color={Colors.Primary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32}}>
                <Icon name="document-text-outline" size={48} color={Colors.TextMuted} />
                <Text style={{fontSize: 16, fontWeight: '600', color: Colors.TextMuted, marginTop: 12, textAlign: 'center'}}>
                  {monthDisplay}에는 해당 카테고리의{'\n'}{typeFilter === 'expense' ? '지출' : '수입'} 내역이 없습니다
                </Text>
              </View>
            </View>
          );

          // Recompute subcategories from detailFilteredTx
          const detailSubs: {name: string; total: number}[] = [];
          const subMap: Record<string, number> = {};
          detailFilteredTx
            .filter(t => t.type === typeFilter)
            .filter(t => {
              const cat = categories.find(c => c.name === t.categoryName || c.id === t.categoryId);
              const txGroup = t.categoryGroup || cat?.group || t.categoryName || '기타';
              return txGroup === selectedGroupForDetail;
            })
            .forEach(t => {
              const subName = t.categoryName || '기타';
              subMap[subName] = (subMap[subName] || 0) + t.amount;
            });
          Object.entries(subMap)
            .sort((a, b) => b[1] - a[1])
            .forEach(([name, total]) => detailSubs.push({ name, total }));
          const detailGroupTotal = detailSubs.reduce((s, sub) => s + sub.total, 0);

          // Generate distinct colors for sub-categories
          const SUB_COLORS = [
            group.color,
            '#74B9FF', '#FD79A8', '#A29BFE', '#55EFC4',
            '#FFEAA7', '#FAB1A0', '#81ECEC', '#DFE6E9',
            '#00CEC9', '#E17055', '#0984E3',
          ];

          // ── Pie Chart for subcategories ──
          const donutSize = 180;
          const donutCx = donutSize / 2;
          const donutCy = donutSize / 2;
          const donutR = 72;

          // ── Line Chart dimensions ──
          const chartMargin = { top: 20, right: 16, bottom: 32, left: 50 };
          const lineChartW = SCREEN_WIDTH - (Spacing.md * 2) - 40;
          const lineChartH = 200;
          const plotW = lineChartW - chartMargin.left - chartMargin.right;
          const plotH = lineChartH - chartMargin.top - chartMargin.bottom;

          const trendMax = Math.max(...groupMonthlyTrendFiltered.map(d => d.amount), 1);
          const trendPoints = groupMonthlyTrendFiltered.map((d, i) => ({
            x: chartMargin.left + (groupMonthlyTrendFiltered.length > 1 ? (i / (groupMonthlyTrendFiltered.length - 1)) * plotW : plotW / 2),
            y: chartMargin.top + plotH - (trendMax > 0 ? (d.amount / trendMax) * plotH : 0),
            ...d,
          }));

          // Create smooth line path
          const linePath = trendPoints.length > 0
            ? trendPoints.reduce((path, p, i) => {
                if (i === 0) return `M ${p.x} ${p.y}`;
                // Smooth cubic bezier
                const prev = trendPoints[i - 1];
                const cpx = (prev.x + p.x) / 2;
                return `${path} C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
              }, '')
            : '';

          // Area fill path (line path + close to bottom)
          const areaPath = linePath && trendPoints.length > 0
            ? `${linePath} L ${trendPoints[trendPoints.length - 1].x} ${chartMargin.top + plotH} L ${trendPoints[0].x} ${chartMargin.top + plotH} Z`
            : '';

          // Y-axis tick values (0, 1/3, 2/3, max)
          const yTicks = [0, Math.round(trendMax / 3), Math.round((trendMax * 2) / 3), trendMax];

          return (
            <View style={detailStyles.container}>
              <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
              {/* Header */}
              <View style={[detailStyles.header, {paddingTop: (StatusBar.currentHeight || 24) + 12}]}>
                <TouchableOpacity
                  onPress={() => setSelectedGroupForDetail(null)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Icon name="arrow-back" size={24} color={Colors.Text} />
                </TouchableOpacity>
                <View style={[detailStyles.headerLeft, {flex: 1, marginLeft: 8}]}>
                  <View style={[detailStyles.headerIconWrap, { backgroundColor: `${group.color}20`, width: 36, height: 36, borderRadius: 18 }]}>
                    <CategoryIcon icon={group.icon} categoryName={group.name} size={18} color={group.color} />
                  </View>
                  <View>
                    <Text style={detailStyles.headerTitle}>{group.name}</Text>
                    <Text style={detailStyles.headerSubtitle}>상세 분석</Text>
                  </View>
                </View>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <TouchableOpacity
                    onPress={() => {
                      const prev = new Date(currentMonth);
                      prev.setMonth(prev.getMonth() - 1);
                      setCurrentMonth(prev);
                    }}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                  >
                    <Icon name="chevron-back" size={18} color={Colors.Primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setPickerYear(currentMonth.getFullYear());
                      setMonthPickerVisible(true);
                    }}
                  >
                    <Text style={{fontSize: 13, fontWeight: '700', color: Colors.Primary}}>{monthDisplay}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const next = new Date(currentMonth);
                      next.setMonth(next.getMonth() + 1);
                      const now = new Date();
                      if (next <= new Date(now.getFullYear(), now.getMonth(), 1)) {
                        setCurrentMonth(next);
                      }
                    }}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                  >
                    <Icon name="chevron-forward" size={18} color={Colors.Primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                contentContainerStyle={detailStyles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* ── 개인/공동/전체 필터 ── */}
                <View style={{ flexDirection: 'row', marginBottom: Spacing.md, gap: Spacing.sm }}>
                  {(['personal', 'couple', 'all'] as const).map((f) => {
                    const label = f === 'personal' ? '개인' : f === 'couple' ? '공동' : '전체';
                    const isActive = detailFilter === f;
                    return (
                      <TouchableOpacity
                        key={f}
                        onPress={() => setDetailFilter(f)}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor: isActive ? group.color : Colors.Surface,
                          borderWidth: 1,
                          borderColor: isActive ? group.color : Colors.Divider,
                        }}
                      >
                        <Text style={{
                          fontSize: 13,
                          fontWeight: isActive ? '700' : '500',
                          color: isActive ? '#FFF' : Colors.TextMuted,
                        }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── Sub-category Donut Chart ── */}
                <GlassCard style={detailStyles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Icon name="pie-chart-outline" size={18} color={group.color} style={styles.sectionHeaderIcon} />
                    <Text style={styles.sectionTitle}>소분류 비율</Text>
                    <View style={{flex: 1}} />
                    <Text style={{fontSize: 15, fontWeight: '800', color: Colors.Text}}>{formatCurrency(detailGroupTotal)}</Text>
                  </View>
                  <Text style={styles.sectionSubtitle}>카테고리 내 세부 항목별 비중</Text>

                  <View style={detailStyles.donutContainer}>
                    <View style={{ width: donutSize, height: donutSize }}>
                      <Svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`}>
                        {(() => {
                          let startAngle = -90;
                          const slices: React.ReactElement[] = [];

                          detailSubs.forEach((sub, i) => {
                            const pct = detailGroupTotal > 0 ? sub.total / detailGroupTotal : 0;
                            const angle = Math.min(pct * 360, 359.99);
                            if (angle <= 0) return;

                            const endAngle = startAngle + angle;
                            const largeArc = angle > 180 ? 1 : 0;
                            const startRad = (startAngle * Math.PI) / 180;
                            const endRad = (endAngle * Math.PI) / 180;
                            const x1 = donutCx + donutR * Math.cos(startRad);
                            const y1 = donutCy + donutR * Math.sin(startRad);
                            const x2 = donutCx + donutR * Math.cos(endRad);
                            const y2 = donutCy + donutR * Math.sin(endRad);
                            const d = [
                              `M ${donutCx} ${donutCy}`,
                              `L ${x1} ${y1}`,
                              `A ${donutR} ${donutR} 0 ${largeArc} 1 ${x2} ${y2}`,
                              'Z',
                            ].join(' ');

                            slices.push(
                              <Path
                                key={`detail-shadow-${i}`}
                                d={d}
                                fill="#000000"
                                opacity={0.08}
                                transform="translate(1, 3)"
                              />
                            );
                            slices.push(
                              <Path
                                key={`detail-pie-${i}`}
                                d={d}
                                fill={SUB_COLORS[i % SUB_COLORS.length]}
                                stroke={Colors.Surface}
                                strokeWidth={2}
                                strokeLinejoin="round"
                              />
                            );
                            startAngle = endAngle;
                          });
                          return slices;
                        })()}
                      </Svg>
                    </View>
                  </View>

                  {/* Legend */}
                  <View style={detailStyles.legendContainer}>
                    {detailSubs.map((sub, i) => {
                      const pct = detailGroupTotal > 0 ? (sub.total / detailGroupTotal) * 100 : 0;
                      const subName = sub.name === group.name ? '기타/기본' : sub.name;
                      const isSelected = selectedSubCategory === sub.name;
                      const isDimmed = selectedSubCategory !== null && !isSelected;
                      return (
                        <TouchableOpacity
                          key={`detail-legend-${i}`}
                          style={[detailStyles.legendItem, isSelected && { backgroundColor: SUB_COLORS[i % SUB_COLORS.length] + '18', borderRadius: BorderRadius.sm }]}
                          activeOpacity={0.6}
                          onPress={() => setSelectedSubCategory(isSelected ? null : sub.name)}
                        >
                          <View style={[detailStyles.legendDot, { backgroundColor: SUB_COLORS[i % SUB_COLORS.length], opacity: isDimmed ? 0.3 : 1 }]} />
                          <Text style={[detailStyles.legendName, isDimmed && { opacity: 0.4 }]} numberOfLines={1}>
                            {subName}
                          </Text>
                          <Text style={[detailStyles.legendAmount, isDimmed && { opacity: 0.4 }]}>{formatCurrency(sub.total)}</Text>
                          <Text style={[detailStyles.legendPct, isDimmed && { opacity: 0.4 }]}>{pct.toFixed(1)}%</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </GlassCard>

                {/* ── Monthly Trend Line Chart ── */}
                <GlassCard style={detailStyles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Icon name="trending-up-outline" size={18} color={group.color} style={styles.sectionHeaderIcon} />
                    <Text style={styles.sectionTitle}>월별 추이</Text>
                    {selectedSubCategory && (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', backgroundColor: group.color + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 }}
                        onPress={() => setSelectedSubCategory(null)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: group.color }}>{selectedSubCategory}</Text>
                        <Icon name="close-circle" size={14} color={group.color} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.sectionSubtitle}>{selectedSubCategory ? `${selectedSubCategory} 최근 6개월 추이` : '최근 6개월 지출 변화'}</Text>

                  {isLoadingTrend ? (
                    <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={group.color} />
                    </View>
                  ) : groupMonthlyTrendFiltered.length > 0 ? (
                    <View style={{ marginTop: Spacing.sm }}>
                      <Svg width={lineChartW} height={lineChartH} viewBox={`0 0 ${lineChartW} ${lineChartH}`}>
                        <Defs>
                          <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0%" stopColor={group.color} stopOpacity={0.3} />
                            <Stop offset="100%" stopColor={group.color} stopOpacity={0.02} />
                          </SvgLinearGradient>
                        </Defs>

                        {/* Horizontal grid lines */}
                        {yTicks.map((tick, i) => {
                          const yPos = chartMargin.top + plotH - (trendMax > 0 ? (tick / trendMax) * plotH : 0);
                          return (
                            <SvgLine
                              key={`grid-${i}`}
                              x1={chartMargin.left}
                              y1={yPos}
                              x2={chartMargin.left + plotW}
                              y2={yPos}
                              stroke={Colors.Divider}
                              strokeWidth={1}
                            />
                          );
                        })}

                        {/* Y-axis labels */}
                        {yTicks.map((tick, i) => {
                          const yPos = chartMargin.top + plotH - (trendMax > 0 ? (tick / trendMax) * plotH : 0);
                          return (
                            <SvgText
                              key={`ylabel-${i}`}
                              x={chartMargin.left - 6}
                              y={yPos + 4}
                              textAnchor="end"
                              fontSize={9}
                              fill={Colors.TextMuted}
                            >
                              {formatCompactCurrency(tick)}
                            </SvgText>
                          );
                        })}

                        {/* Area fill */}
                        {areaPath ? (
                          <Path d={areaPath} fill="url(#areaGrad)" />
                        ) : null}

                        {/* Line */}
                        {linePath ? (
                          <Path
                            d={linePath}
                            fill="none"
                            stroke={group.color}
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : null}

                        {/* Data points */}
                        {trendPoints.map((p, i) => (
                          <G key={`point-${i}`}>
                            <SvgCircle cx={p.x} cy={p.y} r={5} fill={Colors.Surface} stroke={group.color} strokeWidth={2.5} />
                            <SvgCircle cx={p.x} cy={p.y} r={2} fill={group.color} />
                          </G>
                        ))}

                        {/* X-axis labels */}
                        {trendPoints.map((p, i) => (
                          <SvgText
                            key={`xlabel-${i}`}
                            x={p.x}
                            y={chartMargin.top + plotH + 18}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={p.month === currentYearMonth ? '700' : '400'}
                            fill={p.month === currentYearMonth ? group.color : Colors.TextMuted}
                          >
                            {p.label}
                          </SvgText>
                        ))}
                      </Svg>

                      {/* Amount labels below chart */}
                      <View style={detailStyles.trendAmountRow}>
                        {groupMonthlyTrendFiltered.map((d, i) => (
                          <View key={`amt-${i}`} style={[detailStyles.trendAmountItem, { width: plotW / groupMonthlyTrendFiltered.length }]}>
                            <Text style={[
                              detailStyles.trendAmountText,
                              d.month === currentYearMonth && { color: group.color, fontWeight: '700' },
                            ]}>
                              {d.amount > 0 ? formatCompactCurrency(d.amount) : '-'}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Month-over-month comparison */}
                      {(() => {
                        const curIdx = groupMonthlyTrendFiltered.findIndex(d => d.month === currentYearMonth);
                        if (curIdx > 0) {
                          const curAmt = groupMonthlyTrendFiltered[curIdx].amount;
                          const prevAmt = groupMonthlyTrendFiltered[curIdx - 1].amount;
                          const diff = curAmt - prevAmt;
                          const diffPct = prevAmt > 0 ? ((diff / prevAmt) * 100) : 0;
                          const isUp = diff > 0;
                          return (
                            <View style={detailStyles.momContainer}>
                              <Icon
                                name={isUp ? 'arrow-up-circle' : diff < 0 ? 'arrow-down-circle' : 'remove-circle'}
                                size={18}
                                color={isUp ? Colors.Expense : diff < 0 ? Colors.Income : Colors.TextMuted}
                              />
                              <Text style={detailStyles.momText}>
                                전월 대비{' '}
                                <Text style={{ color: isUp ? Colors.Expense : diff < 0 ? Colors.Income : Colors.TextMuted, fontWeight: '700' }}>
                                  {isUp ? '+' : ''}{formatCompactCurrency(Math.abs(diff))}
                                  {prevAmt > 0 ? ` (${isUp ? '+' : ''}${diffPct.toFixed(1)}%)` : ''}
                                </Text>
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  ) : (
                    <View style={styles.emptySection}>
                      <Text style={styles.emptyText}>추이 데이터가 없어요</Text>
                    </View>
                  )}
                </GlassCard>

                {/* ── 거래 내역 ── */}
                <GlassCard style={detailStyles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Icon name="list-outline" size={18} color={group.color} style={styles.sectionHeaderIcon} />
                    <Text style={styles.sectionTitle}>{selectedSubCategory ? `${selectedSubCategory} 거래 내역` : '거래 내역'}</Text>
                  </View>

                  {/* 거래 목록 */}
                  {(() => {
                    const groupTx = detailFilteredTx
                      .filter(t => {
                        const cat = categories.find(c => c.name === t.categoryName || c.id === t.categoryId);
                        const txGroup = t.categoryGroup || cat?.group || t.categoryName || '기타';
                        if (txGroup !== selectedGroupForDetail) return false;
                        if (selectedSubCategory && t.categoryName !== selectedSubCategory) return false;
                        return true;
                      })
                      .sort((a, b) => b.date.getTime() - a.date.getTime());

                    if (groupTx.length === 0) {
                      return (
                        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                          <Icon name="receipt-outline" size={32} color={Colors.TextMuted} />
                          <Text style={{ fontSize: 13, color: Colors.TextMuted, marginTop: 8 }}>거래 내역이 없습니다</Text>
                        </View>
                      );
                    }

                    // 날짜별 그룹핑
                    const dateGroups: { dateLabel: string; txs: Transaction[] }[] = [];
                    const dateMap = new Map<string, Transaction[]>();
                    groupTx.forEach(tx => {
                      const key = `${tx.date.getFullYear()}-${tx.date.getMonth()}-${tx.date.getDate()}`;
                      if (!dateMap.has(key)) dateMap.set(key, []);
                      dateMap.get(key)!.push(tx);
                    });
                    dateMap.forEach((txs) => {
                      const d = txs[0].date;
                      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                      const label = `${d.getMonth() + 1}월 ${d.getDate()}일 ${dayNames[d.getDay()]}요일`;
                      dateGroups.push({ dateLabel: label, txs });
                    });

                    return dateGroups.map((dg, gi) => (
                      <View key={`dg-${gi}`}>
                        {/* 날짜 헤더 */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, marginTop: gi > 0 ? 8 : 0, borderBottomWidth: 1, borderBottomColor: Colors.Divider }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.TextSecondary }}>{dg.dateLabel}</Text>
                          <Text style={{ fontSize: 12, fontWeight: '500', color: typeFilter === 'expense' ? Colors.Expense : Colors.Income }}>
                            {typeFilter === 'expense' ? '-' : '+'}{formatCurrency(dg.txs.filter(t => t.type === typeFilter).reduce((s, t) => s + t.amount, 0))}
                          </Text>
                        </View>

                        {/* 거래 아이템 */}
                        {dg.txs.map((tx) => {
                          const catColor = categories.find(x => x.name === tx.categoryName)?.color || Colors.Expense;
                          const h = String(tx.date.getHours()).padStart(2, '0');
                          const m = String(tx.date.getMinutes()).padStart(2, '0');
                          return (
                            <TouchableOpacity key={tx.id} activeOpacity={0.6} onPress={() => {
                              setSelectedGroupForDetail(null);
                              setTimeout(() => {
                                navigation.getParent()?.navigate('AddTransaction', { editTransaction: tx });
                              }, 300);
                            }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.Divider }}>
                              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: catColor + '18', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                                <CategoryIcon icon={tx.categoryIcon} categoryName={tx.categoryName} size={16} color={catColor} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.Text }} numberOfLines={1}>{tx.description}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  <Text style={{ fontSize: 11, color: Colors.TextMuted }}>
                                    {formatCategoryLabel(tx.categoryName, tx.categoryGroup)}
                                  </Text>
                                  {tx.cardIssuer && (() => {
                                    const bank = getBankInfo(tx.cardIssuer);
                                    return bank ? (
                                      <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: bank.color + '18' }}>
                                        <Text style={{ fontSize: 9, fontWeight: '700', color: bank.color }}>{bank.shortName}</Text>
                                      </View>
                                    ) : null;
                                  })()}
                                  <Text style={{ fontSize: 11, color: Colors.TextMuted }}>{h}:{m}</Text>
                                </View>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: tx.type === 'income' ? Colors.Income : Colors.Expense }}>
                                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                                </Text>
                                <View style={{
                                  paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginTop: 2,
                                  backgroundColor: tx.isCouple ? 'rgba(253,121,168,0.12)' : 'rgba(230,126,34,0.12)',
                                }}>
                                  <Text style={{
                                    fontSize: 9, fontWeight: '500',
                                    color: tx.isCouple ? Colors.Accent : '#E67E22',
                                  }}>
                                    {tx.isCouple ? '공동' : '개인'}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ));
                  })()}
                </GlassCard>

                <View style={{ height: Spacing.xxl }} />
              </ScrollView>
            </View>
          );
        })()}
      </Modal>


      {/* ─── 년/월 선택 모달 ─── */}
      <Modal
        visible={monthPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthPickerVisible(false)}
      >
        <TouchableOpacity
          style={pickerStyles.overlay}
          activeOpacity={1}
          onPress={() => setMonthPickerVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={pickerStyles.container} onPress={() => {}}>
            {/* 년도 선택 */}
            <View style={pickerStyles.yearRow}>
              <TouchableOpacity onPress={() => setPickerYear(y => y - 1)}>
                <Icon name="chevron-back" size={22} color={Colors.Primary} />
              </TouchableOpacity>
              <Text style={pickerStyles.yearText}>{pickerYear}년</Text>
              <TouchableOpacity onPress={() => setPickerYear(y => Math.min(y + 1, new Date().getFullYear()))}>
                <Icon name="chevron-forward" size={22} color={Colors.Primary} />
              </TouchableOpacity>
            </View>

            {/* 월 그리드 */}
            <View style={pickerStyles.monthGrid}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                const now = new Date();
                const isFuture = pickerYear > now.getFullYear() || (pickerYear === now.getFullYear() && month > now.getMonth() + 1);
                const isSelected = pickerYear === currentMonth.getFullYear() && month === currentMonth.getMonth() + 1;
                return (
                  <TouchableOpacity
                    key={month}
                    style={[
                      pickerStyles.monthBtn,
                      isSelected && pickerStyles.monthBtnActive,
                      isFuture && pickerStyles.monthBtnDisabled,
                    ]}
                    onPress={() => {
                      if (!isFuture) {
                        setCurrentMonth(new Date(pickerYear, month - 1, 1));
                        setMonthPickerVisible(false);
                      }
                    }}
                    disabled={isFuture}
                    activeOpacity={0.6}
                  >
                    <Text style={[
                      pickerStyles.monthText,
                      isSelected && pickerStyles.monthTextActive,
                      isFuture && pickerStyles.monthTextDisabled,
                    ]}>
                      {month}월
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 이번 달 바로가기 */}
            <TouchableOpacity
              style={pickerStyles.todayBtn}
              onPress={() => {
                const now = new Date();
                setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setMonthPickerVisible(false);
              }}
              activeOpacity={0.7}
            >
              <Icon name="today-outline" size={16} color={Colors.Primary} />
              <Text style={pickerStyles.todayBtnText}>이번 달</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.Background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },

  // Couple Filter
  coupleFilterRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  coupleFilterChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.Surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.Divider,
  },
  coupleFilterChipActive: {
    backgroundColor: Colors.Primary,
    borderColor: Colors.Primary,
  },
  coupleFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.TextMuted,
  },
  coupleFilterTextActive: {
    color: '#FFFFFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: Spacing.sm,
  },
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
  },

  // Section Headers with Icon
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionHeaderIcon: {
    marginRight: Spacing.xs,
  },

  // Bar Chart
  chartCard: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.TextMuted,
    marginBottom: Spacing.lg,
    paddingLeft: 24, // aligns with title when icon is present
  },
  chartContainer: {
    flexDirection: 'row',
  },
  yAxis: {
    width: 48,
    position: 'relative',
  },
  yLabel: {
    fontSize: 10,
    color: Colors.TextMuted,
  },
  barsContainer: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.Divider,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  barColumn: {
    alignItems: 'center',
    minWidth: 36,
  },
  barWrapper: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: 28,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 12,
    color: Colors.TextMuted,
    marginTop: 8,
    fontWeight: '500',
  },
  barAmount: {
    fontSize: 9,
    color: Colors.TextMuted,
    marginTop: 2,
  },

  // Ranking
  rankingCard: {
    marginBottom: Spacing.md,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.Divider,
    gap: 10,
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 110,
    flexShrink: 0,
  },
  rankNumber: {
    fontSize: 14,
    color: Colors.TextMuted,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
  },
  rankNumberTop3: {
    fontSize: 18,
  },
  rankIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  rankIconText: {
  },
  rankName: {
    fontSize: 14,
    color: Colors.Text,
    fontWeight: '500',
  },
  rankRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  rankBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.Surface,
    borderRadius: 3,
    overflow: 'hidden',
    maxWidth: 80,
  },
  rankBar: {
    height: '100%',
    borderRadius: 3,
  },
  rankAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.Text,
    width: 80,
    textAlign: 'right',
  },
  rankPct: {
    fontSize: 11,
    color: Colors.TextMuted,
    width: 48,
    textAlign: 'right',
  },
  subCategoriesContainer: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    marginTop: -4,
    marginBottom: Spacing.sm,
  },
  subCategoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  subCategoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  subCategoryBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.TextMuted,
    marginRight: 8,
    marginLeft: 12,
  },
  subCategoryName: {
    fontSize: 13,
    color: Colors.TextSecondary,
  },
  subCategoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 130,
  },
  subCategoryAmount: {
    fontSize: 13,
    color: Colors.TextSecondary,
    width: 80,
    textAlign: 'right',
    marginRight: Spacing.sm,
  },
  subCategoryPct: {
    fontSize: 11,
    color: Colors.TextMuted,
    width: 40,
    textAlign: 'right',
  },

  // Comparison
  comparisonCard: {
    marginBottom: Spacing.md,
  },
  comparisonBars: {
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  comparisonBarItem: {
    gap: Spacing.xs,
  },
  comparisonLabel: {
    fontSize: 13,
    color: Colors.TextSecondary,
    fontWeight: '500',
  },
  comparisonBarBg: {
    height: 12,
    backgroundColor: Colors.Surface,
    borderRadius: 6,
    overflow: 'hidden',
  },
  comparisonBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  comparisonAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  netBalance: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.Divider,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netBalanceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  netBalanceAmount: {
    fontSize: 22,
    fontWeight: '800',
  },

  // Couple
  coupleCard: {
    marginBottom: Spacing.md,
  },
  coupleMembers: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  coupleMember: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  coupleAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  coupleAvatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  coupleName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.Text,
  },
  coupleAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  couplePct: {
    fontSize: 13,
    color: Colors.TextMuted,
  },
  splitBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  splitSegment: {
    height: '100%',
  },

  // Empty states
  emptySection: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.TextMuted,
  },
});

const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.Background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: (StatusBar.currentHeight || 24) + 4,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.Surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.Divider,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.Text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.TextMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.Background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  sectionCard: {
    marginBottom: Spacing.md,
  },
  donutContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  donutCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutCenterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.TextMuted,
    marginBottom: 2,
  },
  donutCenterAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.Text,
  },
  legendContainer: {
    marginTop: Spacing.sm,
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
    flexShrink: 0,
  },
  legendName: {
    fontSize: 13,
    color: Colors.Text,
    flex: 1,
    flexShrink: 1,
  },
  legendAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TextSecondary,
    width: 90,
    textAlign: 'right',
    marginRight: Spacing.sm,
  },
  legendPct: {
    fontSize: 12,
    color: Colors.TextMuted,
    width: 48,
    textAlign: 'right',
  },
  trendAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingLeft: 50,
    marginTop: 4,
  },
  trendAmountItem: {
    alignItems: 'center',
  },
  trendAmountText: {
    fontSize: 10,
    color: Colors.TextMuted,
  },
  momContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.Divider,
  },
  momText: {
    fontSize: 13,
    color: Colors.TextSecondary,
  },
});

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  container: {
    width: '100%',
    backgroundColor: Colors.Surface,
    borderRadius: 16,
    padding: 20,
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  yearText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthBtn: {
    width: '22%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.Background,
  },
  monthBtnActive: {
    backgroundColor: Colors.Primary,
  },
  monthBtnDisabled: {
    opacity: 0.3,
  },
  monthText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.Text,
  },
  monthTextActive: {
    color: '#FFFFFF',
  },
  monthTextDisabled: {
    color: Colors.TextMuted,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.Primary + '40',
    backgroundColor: Colors.Primary + '10',
  },
  todayBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.Primary,
  },
});

export default StatsScreen;
