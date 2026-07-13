/**
 * PairBudget 거래 내역 화면
 * 월별 거래 목록 - 날짜별 그룹핑, 필터, FAB
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  StatusBar,
  RefreshControl,
  Modal,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/Ionicons';
import CategoryIcon from '../../components/CategoryIcon';
import { useAlert } from '../../components/CustomAlert';
import { Colors } from '../../theme/colors';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { formatCurrency } from '../../utils/formatCurrency';
import { useAuth } from '../../contexts/AuthContext';
import { useHousehold } from '../../contexts/HouseholdContext';
import { getBankInfo } from '../../utils/BankInfo';
import type { Transaction } from '../../types';
import { formatCategoryLabel } from '../../utils/formatCategory';
import { useMonth } from '../../contexts/MonthContext';
import { useFiscalCycle } from '../../contexts/FiscalCycleContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const formatGroupDate = (date: Date): string => {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayName = DAY_NAMES[date.getDay()];
  return `${m}월 ${d}일 ${dayName}`;
};

const getDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

type FilterType = 'all' | 'personal' | 'couple';

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  dayTotal: number;
  dayIncome: number;
  transactions: Transaction[];
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'personal', label: '개인' },
  { key: 'couple', label: '공동' },
  { key: 'all', label: '전체' },
];

interface TransactionListScreenProps {
  navigation: any;
}

const TransactionListScreen: React.FC<TransactionListScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const { categories } = useHousehold();
  const { showAlert } = useAlert();
  const { currentMonth, setCurrentMonth, monthPickerVisible, setMonthPickerVisible, pickerYear, setPickerYear } = useMonth();
  const fiscalCycle = useFiscalCycle();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FilterType>('personal');
  const [refreshing, setRefreshing] = useState(false);
  const fabScale = useRef(new Animated.Value(1)).current;

  const monthLabel = fiscalCycle.getMonthDisplayLabel(currentMonth);

  // Firestore listener
  useEffect(() => {
    if (!user?.householdId) { setTransactions([]); return; }
    const { start, end } = fiscalCycle.getDateRange(currentMonth);
    const unsub = firestore()
      .collection('households').doc(user.householdId)
      .collection('transactions')
      .where('date', '>=', start).where('date', '<=', end)
      .orderBy('date', 'desc')
      .onSnapshot(snap => {
        setTransactions(snap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id, amount: d.amount || 0, type: d.type || 'expense',
            categoryId: d.categoryId || '', categoryName: d.categoryName || '',
            categoryIcon: d.categoryIcon || '', description: d.description || '',
            date: d.date?.toDate() || new Date(), createdBy: d.createdBy || '',
            createdByName: d.createdByName || '', source: d.source || 'manual',
            cardIssuer: d.cardIssuer || undefined,
            categoryGroup: d.categoryGroup || undefined,
            isCouple: d.isCouple || false, memo: d.memo || undefined, createdAt: d.createdAt?.toDate() || new Date(),
            updatedAt: d.updatedAt?.toDate() || new Date(),
          };
        }));
      }, err => console.error('TxList:', err));
    return () => unsub();
  }, [user?.householdId, currentMonth, fiscalCycle.enabled, fiscalCycle.startDay]);

  const groupedData = useMemo((): DateGroup[] => {
    let filtered = transactions;
    if (filter === 'all') {
      filtered = filtered.filter(tx => tx.isCouple || tx.createdBy === user?.uid);
    } else if (filter === 'personal') {
      filtered = filtered.filter(tx => !tx.isCouple && tx.createdBy === user?.uid);
    } else if (filter === 'couple') {
      filtered = filtered.filter(tx => tx.isCouple);
    }
    const sorted = [...filtered].sort((a, b) => b.date.getTime() - a.date.getTime());
    const groups: Map<string, DateGroup> = new Map();
    sorted.forEach(tx => {
      const key = getDateKey(tx.date);
      if (!groups.has(key)) groups.set(key, { dateKey: key, dateLabel: formatGroupDate(tx.date), dayTotal: 0, dayIncome: 0, transactions: [] });
      const g = groups.get(key)!;
      g.transactions.push(tx);
      if (tx.type === 'expense') g.dayTotal += tx.amount;
      if (tx.type === 'income') g.dayIncome += tx.amount;
    });
    return Array.from(groups.values());
  }, [filter, transactions, user?.uid]);

  const monthlySummary = useMemo(() => {
    let filtered = transactions;
    if (filter === 'all') {
      filtered = filtered.filter(t => t.isCouple || t.createdBy === user?.uid);
    } else if (filter === 'personal') {
      filtered = filtered.filter(t => !t.isCouple && t.createdBy === user?.uid);
    } else if (filter === 'couple') {
      filtered = filtered.filter(t => t.isCouple);
    }
    const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    return { totalExpense, totalIncome, balance: totalIncome - totalExpense };
  }, [filter, transactions, user?.uid]);

  const handleLongPress = useCallback((tx: Transaction) => {
    if (!user?.householdId) return;
    showAlert({
      title: '내역 삭제',
      message: `"${tx.description}" 내역을 삭제하시겠습니까?`,
      icon: 'delete',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: async () => {
          try {
            await firestore().collection('households').doc(user.householdId!)
              .collection('transactions').doc(tx.id).delete();
          } catch (e) { console.error('Delete err:', e); }
        }},
      ],
    });
  }, [user?.householdId]);

  const handleFabPress = useCallback(() => {
    Animated.sequence([
      Animated.timing(fabScale, {
        toValue: 0.9,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(fabScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start(() => {
      navigation.navigate('Add');
    });
  }, [fabScale, navigation]);

  const handlePrevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
  };

  const renderTimeLabel = (date: Date) => {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  // ─── Empty State ───
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="receipt-outline" size={64} color={Colors.TextMuted} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>거래 내역이 없어요</Text>
      <Text style={styles.emptySubtitle}>
        아래 + 버튼을 눌러{'\n'}첫 거래를 기록해보세요!
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />

      {/* ─── Transaction List ─── */}
      <FlatList
        style={{flex: 1}}
        data={groupedData}
        keyExtractor={(item) => item.dateKey}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, groupedData.length === 0 && {flex: 1}]}
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={
          <View style={{ backgroundColor: Colors.Background, paddingTop: Spacing.xxl, paddingBottom: 8 }}>
            {/* ─── Header ─── */}
            <View style={styles.header}>
              <View style={styles.monthPicker}>
                <TouchableOpacity onPress={handlePrevMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Icon name="chevron-back" size={22} color={Colors.Primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPickerYear(currentMonth.getFullYear()); setMonthPickerVisible(true); }}>
                  <Text style={styles.monthLabel}>{monthLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNextMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Icon name="chevron-forward" size={22} color={Colors.Primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ─── Monthly Summary ─── */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>수입</Text>
                <Text style={[styles.summaryValue, {color: Colors.Income}]}>+{formatCurrency(monthlySummary.totalIncome)}</Text>
              </View>
              <View style={[styles.summaryDivider]} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>지출</Text>
                <Text style={[styles.summaryValue, {color: Colors.Expense}]}>-{formatCurrency(monthlySummary.totalExpense)}</Text>
              </View>
              <View style={[styles.summaryDivider]} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>합계</Text>
                <Text style={[styles.summaryValue, {color: monthlySummary.balance >= 0 ? '#27AE60' : Colors.Expense}]}>
                  {monthlySummary.balance >= 0 ? '+' : ''}{formatCurrency(monthlySummary.balance)}
                </Text>
              </View>
            </View>

            {/* ─── Filter Chips ─── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContainer}
              style={{flexGrow: 0}}
            >
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.filterChip,
                    filter === f.key && styles.filterChipActive,
                  ]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filter === f.key && styles.filterChipTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 600);
              }}
              tintColor={Colors.Primary}
              colors={[Colors.Primary]}
            />
          }
          renderItem={({ item: group }) => (
            <View style={styles.dateGroup}>
              {/* Date header */}
              <View style={styles.dateHeader}>
                <Text style={styles.dateLabel}>{group.dateLabel}</Text>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  {group.dayIncome > 0 && (
                    <Text style={[styles.dayTotal, {color: Colors.Income}]}>
                      +{formatCurrency(group.dayIncome)}
                    </Text>
                  )}
                  {group.dayTotal > 0 && (
                    <Text style={styles.dayTotal}>
                      -{formatCurrency(group.dayTotal)}
                    </Text>
                  )}
                </View>
              </View>

              {/* Transactions */}
              {group.transactions.map((tx) => (
                <TouchableOpacity
                  key={tx.id}
                  activeOpacity={0.7}
                  onPress={() => navigation.getParent()?.navigate('AddTransaction', { editTransaction: tx })}
                  onLongPress={() => handleLongPress(tx)}
                  delayLongPress={500}
                >
                  <View style={styles.txItem}>
                    {(() => {
                      const catColor = categories.find(x => x.name === tx.categoryName)?.color || (tx.type === 'income' ? Colors.Income : Colors.Expense);
                      return (
                        <View style={[styles.txIconCircle, { backgroundColor: catColor + '18' }]}>
                          <CategoryIcon icon={tx.categoryIcon} categoryName={tx.categoryName} size={20} color={catColor} style={styles.txIcon} />
                        </View>
                      );
                    })()}
                    <View style={styles.txInfo}>
                      <Text style={styles.txDescription} numberOfLines={1}>
                        {tx.description}
                      </Text>
                      <View style={styles.txMetaRow}>
                        <Text style={styles.txCategory}>
                          {formatCategoryLabel(tx.categoryName, tx.categoryGroup)}
                        </Text>
                        {tx.cardIssuer && (() => {
                          const bank = getBankInfo(tx.cardIssuer);
                          return bank ? (
                            <View style={[styles.bankTag, { backgroundColor: bank.color + '18' }]}>
                              <Text style={[styles.bankTagText, { color: bank.color }]}>{bank.shortName}</Text>
                            </View>
                          ) : null;
                        })()}
                        <Text style={styles.txTime}>
                          {renderTimeLabel(tx.date)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.txRight}>
                      <Text
                        style={[
                          styles.txAmount,
                          {
                            color:
                              tx.type === 'income'
                                ? Colors.Income
                                : Colors.Expense,
                          },
                        ]}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </Text>
                      <View style={styles.txBadges}>
                        {tx.isCouple ? (
                          <View style={styles.coupleBadge}>
                            <Text style={styles.coupleBadgeText}>공동</Text>
                          </View>
                        ) : (
                          <View style={styles.personalBadge}>
                            <Text style={styles.personalBadgeText}>개인</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

      {/* ─── FAB ─── */}
      <Animated.View
        style={[styles.fabContainer, { transform: [{ scale: fabScale }] }]}
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={handleFabPress}
          activeOpacity={0.8}
        >
          <Icon name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Month Picker Modal ─── */}
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

  // Header
  header: {
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

  // Filters
  filterContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.Divider,
    marginRight: Spacing.sm,
  },
  filterChipActive: {
    backgroundColor: Colors.Primary,
    borderColor: Colors.Primary,
  },
  filterChipText: {
    fontSize: 14,
    color: Colors.TextMuted,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Monthly Summary
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.Surface,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.TextMuted,
    fontWeight: '500',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.Divider,
  },

  // List
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  dateGroup: {
    marginBottom: Spacing.lg,
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.Divider,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  dayTotal: {
    fontSize: 13,
    color: Colors.Expense,
    fontWeight: '500',
  },

  // Transaction item
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.Divider,
  },
  txIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  txIcon: {
  },
  txInfo: {
    flex: 1,
  },
  txDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.Text,
    marginBottom: 2,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  txCategory: {
    fontSize: 12,
    color: Colors.TextMuted,
  },
  txTime: {
    fontSize: 12,
    color: Colors.TextMuted,
  },
  bankTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  bankTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  txBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  autoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
    borderRadius: 4,
  },
  autoBadgeText: {
    fontSize: 10,
    color: Colors.Primary,
    fontWeight: '500',
  },
  manualBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(160, 160, 192, 0.12)',
    borderRadius: 4,
  },
  manualBadgeText: {
    fontSize: 10,
    color: Colors.TextSecondary,
    fontWeight: '500',
  },
  coupleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(253, 121, 168, 0.12)',
    borderRadius: 4,
  },
  coupleBadgeText: {
    fontSize: 10,
    color: Colors.Accent,
    fontWeight: '500',
  },
  personalBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(230, 126, 34, 0.12)',
    borderRadius: 4,
  },
  personalBadgeText: {
    fontSize: 10,
    color: '#E67E22',
    fontWeight: '500',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
    paddingTop: 60,
  },
  emptyIcon: {
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.TextMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // FAB
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    right: 20,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.Primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: Colors.Primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
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

export default TransactionListScreen;
