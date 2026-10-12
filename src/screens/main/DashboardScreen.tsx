/**
 * PairBudget 대시보드 화면
 * Firestore 실시간 데이터 연동
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  StatusBar,
  RefreshControl,
  Platform,
  PermissionsAndroid,
  Modal,
  Linking,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/Ionicons';
import CategoryIcon from '../../components/CategoryIcon';
import { useAlert } from '../../components/CustomAlert';
import { Colors } from '../../theme/colors';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { GlassCard } from '../../components/GlassCard';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime, getYearMonth, getStartOfMonth, getEndOfMonth, getMonthLabel } from '../../utils/dateUtils';
import { useAuth } from '../../contexts/AuthContext';
import { getBankInfo } from '../../utils/BankInfo';
import { formatCategoryLabel } from '../../utils/formatCategory';
import { useHousehold } from '../../contexts/HouseholdContext';
import type { Transaction } from '../../types';
import { getPendingTransactions, checkNotificationPermission, requestNotificationPermission } from '../../services/NotificationService';
import { SecureStorage } from '../../services/SecureStorage';
import { useMonth } from '../../contexts/MonthContext';
import { useFiscalCycle } from '../../contexts/FiscalCycleContext';
import FiscalCycleSettingSheet from '../../components/FiscalCycleSettingSheet';
import { checkForUpdate, CURRENT_VERSION_NAME } from '../../services/UpdateService';
import { analyzeFixedCosts, FixedCostItem } from '../../utils/FixedCostAnalyzer';
import ScrollToTopButton from '../../components/ScrollToTopButton';

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

const AnimatedCount: React.FC<{
  toValue: number;
  duration?: number;
  style?: any;
  prefix?: string;
}> = ({ toValue, duration = 1200, style, prefix = '' }) => {
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    animValue.setValue(0);
    const listener = animValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });
    Animated.timing(animValue, {
      toValue,
      duration,
      useNativeDriver: false,
    }).start();
    return () => animValue.removeListener(listener);
  }, [toValue, duration, animValue]);

  return (
    <Text style={style}>
      {prefix}{formatCurrency(displayValue)}
    </Text>
  );
};

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { household, categories, joinRequest, acceptJoinRequest, rejectJoinRequest } = useHousehold();
  const { showAlert } = useAlert();
  const { currentMonth, setCurrentMonth, monthPickerVisible, setMonthPickerVisible, pickerYear, setPickerYear } = useMonth();
  const fiscalCycle = useFiscalCycle();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'personal' | 'couple'>('personal');
  const [pendingCount, setPendingCount] = useState(0);
  const [fiscalSheetVisible, setFiscalSheetVisible] = useState(false);
  const [fixedCosts, setFixedCosts] = useState<FixedCostItem[]>([]);
  const [fixedCostExpanded, setFixedCostExpanded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // 대기 중인 거래 수 로딩
  const loadPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingTransactions();
      setPendingCount(pending.length);
    } catch { setPendingCount(0); }
  }, []);

  useEffect(() => {
    loadPendingCount();
    // 화면 포커스 시 다시 로딩
    const unsubscribe = navigation.addListener('focus', loadPendingCount);
    return unsubscribe;
  }, [navigation, loadPendingCount]);

  // 첫 실행 시 알림 권한 체크 (접근 + 푸시)
  useEffect(() => {
    const checkPermissions = async () => {
      const asked = await SecureStorage.getItem('@PairBudget:notifPermAsked');
      if (asked) return;

      // 1. 알림 접근 허용 체크
      const status = await checkNotificationPermission();
      if (status !== 'authorized') {
        showAlert({
          title: '알림 접근 허용',
          message: '은행/문자 알림을 자동으로 읽어 가계부에 등록하려면 알림 접근 허용이 필요합니다.\n\n설정으로 이동하시겠습니까?',
          icon: 'info',
          buttons: [
            { text: '나중에', style: 'cancel' },
            { text: '설정 열기', onPress: () => requestNotificationPermission() },
          ],
        });
      }

      // 2. POST_NOTIFICATIONS 권한 요청 (Android 13+)
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (!granted) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
        }
      }

      await SecureStorage.setItem('@PairBudget:notifPermAsked', 'true');
    };
    checkPermissions();
  }, []);

  // 앱 업데이트 체크
  useEffect(() => {
    const doUpdateCheck = async () => {
      const update = await checkForUpdate();
      if (!update) return;

      const handleUpdate = () => {
        Linking.openURL(update.downloadUrl);
      };

      showAlert({
        title: '업데이트 알림 🎉',
        message: `새 버전 v${update.latestVersionName}이 출시되었습니다!\n\n${update.releaseNotes || '최신 버전으로 업데이트 해주세요.'}`,
        icon: 'info',
        buttons: update.forceUpdate
          ? [
              { text: '업데이트', onPress: handleUpdate },
            ]
          : [
              { text: '나중에', style: 'cancel' },
              { text: '업데이트', onPress: handleUpdate },
            ],
      });
    };
    doUpdateCheck();
  }, []);

  useEffect(() => {
    if (!user?.householdId) {
      setTransactions([]);
      return;
    }
    const { start, end } = fiscalCycle.getDateRange(currentMonth);
    const unsub = firestore()
      .collection('households').doc(user.householdId)
      .collection('transactions')
      .where('date', '>=', start).where('date', '<=', end)
      .orderBy('date', 'desc')
      .onSnapshot(snap => {
        const list: Transaction[] = snap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id, amount: d.amount || 0, type: d.type || 'expense',
            categoryId: d.categoryId || '', categoryName: d.categoryName || '',
            categoryIcon: d.categoryIcon || '', description: d.description || '',
            date: d.date?.toDate() || new Date(), createdBy: d.createdBy || '',
            createdByName: d.createdByName || '', source: d.source || 'manual',
            cardIssuer: d.cardIssuer || undefined,
            categoryGroup: d.categoryGroup || undefined,
            isCouple: d.isCouple || false, memo: d.memo || '',
            createdAt: d.createdAt?.toDate() || new Date(),
            updatedAt: d.updatedAt?.toDate() || new Date(),
          };
        });
        setTransactions(list);
      }, err => console.error('TX listener:', err));
    return () => unsub();
  }, [user?.householdId, currentMonth, fiscalCycle.enabled, fiscalCycle.startDay]);

  // 🟢 고정비 분석 (항상 개인 거래만 — 공동 거래는 고정비 대상에서 제외)
  useEffect(() => {
    if (!user?.householdId || !user?.uid) {
      setFixedCosts([]);
      return;
    }
    analyzeFixedCosts(user.householdId, currentMonth, user.uid, 'personal', fiscalCycle)
      .then(setFixedCosts)
      .catch(() => setFixedCosts([]));
  }, [user?.householdId, user?.uid, currentMonth, fiscalCycle.enabled, fiscalCycle.startDay]);

  const monthLabel = fiscalCycle.getMonthDisplayLabel(currentMonth);

  const filteredTx = useMemo(() => {
    if (viewMode === 'all') return transactions.filter(t => t.isCouple || t.createdBy === user?.uid);
    if (viewMode === 'couple') return transactions.filter(t => t.isCouple);
    return transactions.filter(t => !t.isCouple && t.createdBy === user?.uid); // personal
  }, [transactions, viewMode, user?.uid]);

  const totalExpense = useMemo(() => filteredTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [filteredTx]);
  const totalIncome = useMemo(() => filteredTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [filteredTx]);
  const balance = totalIncome - totalExpense;

  const { sortedCats, catTotal } = useMemo(() => {
    const catMap: Record<string, { name: string; icon: string; total: number; color: string }> = {};
    filteredTx.filter(t => t.type === 'expense').forEach(t => {
      // 대메뉴(group) 기준으로 합산
      const cat = categories.find(c => c.name === t.categoryName || c.id === t.categoryId);
      const groupName = t.categoryGroup || cat?.group || t.categoryName || '기타';
      
      if (!catMap[groupName]) {
        catMap[groupName] = { 
          name: groupName, 
          icon: GROUP_ICONS[groupName] || cat?.icon || 'cash-outline', 
          total: 0, 
          color: GROUP_COLORS[groupName] || cat?.color || '#B2BEC3' 
        };
      }
      catMap[groupName].total += t.amount;
    });
    const sorted = Object.values(catMap).sort((a, b) => b.total - a.total);
    return { sortedCats: sorted, catTotal: sorted.reduce((s, c) => s + c.total, 0) };
  }, [filteredTx, categories]);

  const recentTx = useMemo(() => filteredTx.slice(0, 5), [filteredTx]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={100}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              // Firestore onSnapshot이 실시간이라 리스너가 자동 갱신
              // 화면을 다시 마운트하는 효과
            }}
            tintColor={Colors.Primary}
            colors={[Colors.Primary]}
          />
        }
      >
        {/* 참여 요청 알림 배너 */}
        {joinRequest && (
          <View style={{
            backgroundColor: Colors.Primary + '15',
            borderRadius: BorderRadius.md,
            padding: Spacing.md,
            marginHorizontal: Spacing.md,
            marginTop: Spacing.sm,
            borderWidth: 1,
            borderColor: Colors.Primary + '30',
          }}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm}}>
              <Icon name="person-add" size={20} color={Colors.Primary} />
              <Text style={{fontSize: 15, fontWeight: '700', color: Colors.Text, marginLeft: Spacing.sm}}>
                참여 요청
              </Text>
            </View>
            <Text style={{fontSize: 14, color: Colors.TextSecondary, marginBottom: Spacing.md}}>
              {joinRequest.displayName || joinRequest.email}님이 가계부에 참여를 요청했습니다.
            </Text>
            <View style={{flexDirection: 'row', gap: Spacing.sm}}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: Colors.Primary,
                  borderRadius: BorderRadius.sm,
                  paddingVertical: Spacing.sm,
                  alignItems: 'center',
                }}
                onPress={async () => {
                  try {
                    await acceptJoinRequest();
                    showAlert({title: '수락 완료', message: '가계부에 합류되었습니다.'});
                  } catch (e: any) {
                    showAlert({title: '오류', message: e.message});
                  }
                }}
              >
                <Text style={{color: '#fff', fontWeight: '700', fontSize: 14}}>수락</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: Colors.Surface,
                  borderRadius: BorderRadius.sm,
                  paddingVertical: Spacing.sm,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: Colors.CardBorder,
                }}
                onPress={async () => {
                  try {
                    await rejectJoinRequest();
                  } catch (e: any) {
                    showAlert({title: '오류', message: e.message});
                  }
                }}
              >
                <Text style={{color: Colors.TextSecondary, fontWeight: '600', fontSize: 14}}>거절</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.header}>
          <View style={styles.monthPicker}>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
              <Icon name="chevron-back" size={22} color={Colors.Primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPickerYear(currentMonth.getFullYear()); setMonthPickerVisible(true); }}>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} hitSlop={{top:12,bottom:12,left:12,right:12}}>
              <Icon name="chevron-forward" size={22} color={Colors.Primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFiscalSheetVisible(true)} hitSlop={{top:12,bottom:12,left:12,right:12}} style={{marginLeft: 4}}>
              <Icon name="options-outline" size={18} color={fiscalCycle.enabled ? Colors.Primary : Colors.TextMuted} />
            </TouchableOpacity>
          </View>
          {/* 아바타 + 알림벨 */}
          <View style={styles.headerRight}>
            {user?.photoURL ? (
              <View style={styles.headerAvatar}>
                <Text style={styles.headerAvatarText}>
                  {(() => {
                    const AVATARS: Record<string, string> = {
                      boy: '👦', girl: '👧', man: '👨', woman: '👩',
                      cat: '🐱', dog: '🐶', bear: '🐻', fox: '🦊',
                      rabbit: '🐰', panda: '🐼', frog: '🐸', penguin: '🐧',
                    };
                    return AVATARS[user.photoURL] || user.displayName?.charAt(0) || '?';
                  })()}
                </Text>
              </View>
            ) : (
              <Icon name="person-circle" size={44} color={Colors.Primary} />
            )}
            {/* 등록대기 알림 벨 */}
            <TouchableOpacity
              style={styles.pendingBell}
              onPress={() => navigation.getParent()?.navigate('PendingTransactions')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="notifications-outline" size={26} color={Colors.TextSecondary} />
              {pendingCount > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 세그먼트 컨트롤 */}
        <View style={styles.segmentContainer}>
          {(['personal', 'couple', 'all'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[styles.segmentBtn, viewMode === mode && styles.segmentBtnActive]}
              onPress={() => setViewMode(mode)}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, viewMode === mode && styles.segmentTextActive]}>
                {mode === 'personal' ? '개인' : mode === 'couple' ? '공동' : '전체'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {household && (
          <View style={styles.householdBadge}>
            <View style={styles.householdLeft}>
              <Icon name="home-outline" size={16} color={Colors.TextSecondary} />
              <Text style={styles.householdName}>{household.name}</Text>
            </View>
            <View style={styles.householdRight}>
              <Icon name="people-outline" size={14} color={Colors.TextMuted} />
              <Text style={styles.householdMembers}>{household.members.length}명</Text>
            </View>
          </View>
        )}

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <GlassCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>이번 달 지출</Text>
            <AnimatedCount toValue={totalExpense} style={[styles.summaryAmount, { color: Colors.Expense }]} />
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summarySubLabel}>수입</Text>
                <AnimatedCount toValue={totalIncome} style={styles.summarySubAmountIncome} prefix="+" />
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summarySubLabel}>잔액</Text>
                <AnimatedCount toValue={balance} style={[styles.summarySubAmountBalance, { color: balance >= 0 ? Colors.Secondary : Colors.Expense }]} />
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {viewMode === 'couple' && (
          <Text style={styles.filterHint}>공동 지출만 표시됩니다</Text>
        )}
        {viewMode === 'personal' && (
          <Text style={styles.filterHint}>개인 지출만 표시됩니다</Text>
        )}

        {/* ─── 고정비 카드 (공동 모드에서는 숨김) ─── */}
        {viewMode !== 'couple' && fixedCosts.length > 0 && (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <GlassCard style={styles.chartCard}>
              <TouchableOpacity
                style={styles.fixedCostHeader}
                onPress={() => setFixedCostExpanded(!fixedCostExpanded)}
                activeOpacity={0.7}
              >
                <View style={styles.fixedCostTitleRow}>
                  <Icon name="repeat-outline" size={18} color={Colors.Primary} />
                  <Text style={[styles.sectionTitle, {marginBottom: 0}]}>고정비</Text>
                  <Text style={styles.fixedCostTotal}>
                    {formatCurrency(fixedCosts.reduce((s, c) => s + c.amount, 0))}
                  </Text>
                </View>
                <Icon
                  name={fixedCostExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.TextMuted}
                />
              </TouchableOpacity>
              {(fixedCostExpanded ? fixedCosts : fixedCosts.slice(0, 3)).map((item, i) => (
                <View key={`fc-${i}`} style={styles.fixedCostRow}>
                  <View style={styles.categoryLeft}>
                    <CategoryIcon icon={item.categoryIcon} categoryName={item.categoryName} size={16} color={Colors.TextSecondary} style={styles.categoryIcon} />
                    <Text style={styles.categoryName} numberOfLines={1}>{item.description}</Text>
                  </View>
                  <View style={styles.fixedCostRight}>
                    <Text style={styles.categoryAmount}>
                      {item.isFixed ? '' : '~'}{formatCurrency(item.amount)}
                    </Text>
                    <Text style={[styles.fixedCostBadge, { color: item.isFixed ? Colors.Primary : Colors.TextMuted }]}>
                      {item.isFixed ? '고정' : '변동'}
                    </Text>
                  </View>
                </View>
              ))}
              {!fixedCostExpanded && fixedCosts.length > 3 && (
                <TouchableOpacity onPress={() => setFixedCostExpanded(true)} style={styles.fixedCostMore}>
                  <Text style={styles.fixedCostMoreText}>+{fixedCosts.length - 3}개 더보기</Text>
                </TouchableOpacity>
              )}
            </GlassCard>
          </Animated.View>
        )}

        {sortedCats.length > 0 ? (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <GlassCard style={styles.chartCard}>
              <Text style={styles.sectionTitle}>카테고리별 지출</Text>
              <View style={styles.stackedBarContainer}>
                <View style={styles.stackedBar}>
                  {sortedCats.map((cat, i) => (
                    <View key={`bar-${cat.name}-${i}`} style={[styles.barSegment, {
                      width: `${(cat.total / catTotal) * 100}%` as any,
                      backgroundColor: cat.color,
                      borderTopLeftRadius: i === 0 ? 6 : 0, borderBottomLeftRadius: i === 0 ? 6 : 0,
                      borderTopRightRadius: i === sortedCats.length - 1 ? 6 : 0, borderBottomRightRadius: i === sortedCats.length - 1 ? 6 : 0,
                    }]} />
                  ))}
                </View>
              </View>
              {sortedCats.map((cat, i) => (
                <TouchableOpacity
                  key={`row-${cat.name}-${i}`}
                  style={styles.categoryRow}
                  activeOpacity={0.6}
                  onPress={() => navigation.navigate('Stats', { selectedGroup: cat.name })}
                >
                  <View style={styles.categoryLeft}>
                    <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                    <CategoryIcon icon={cat.icon} categoryName={cat.name} size={16} color={cat.color} style={styles.categoryIcon} />
                    <Text style={styles.categoryName}>{cat.name}</Text>
                  </View>
                  <View style={styles.categoryRight}>
                    <Text style={styles.categoryAmount}>{formatCurrency(cat.total)}</Text>
                    <Text style={styles.categoryPct}>{((cat.total / catTotal) * 100).toFixed(0)}%</Text>
                    <Icon name="chevron-forward" size={14} color={Colors.TextMuted} style={{marginLeft: 4}} />
                  </View>
                </TouchableOpacity>
              ))}
            </GlassCard>
          </Animated.View>
        ) : (
          <GlassCard style={styles.emptyCard}>
            <Icon name="bar-chart-outline" size={48} color={Colors.TextMuted} />
            <Text style={styles.emptyText}>아직 거래 내역이 없어요</Text>
            <Text style={styles.emptySubText}>아래 + 버튼으로 첫 거래를 추가해보세요!</Text>
          </GlassCard>
        )}

        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>최근 거래</Text>
        </View>

        {recentTx.length > 0 ? recentTx.map(tx => (
          <TouchableOpacity key={tx.id} activeOpacity={0.7} onPress={() => navigation.getParent()?.navigate('AddTransaction', { editTransaction: tx })}>
            <GlassCard style={styles.txCard}>
              <View style={styles.txRow}>
                <CategoryIcon icon={tx.categoryIcon} categoryName={tx.categoryName} size={24} color={(() => { const c = categories.find(x => x.name === tx.categoryName); return c?.color || Colors.TextSecondary; })()} style={styles.txIcon} />
                <View style={styles.txInfo}>
                  <Text style={styles.txDescription}>{tx.description}</Text>
                  <Text style={styles.txMeta}>
                    <Text style={{ color: tx.isCouple ? Colors.Primary : '#E67E22', fontWeight: '600' }}>
                      {tx.isCouple ? '공동' : '개인'}
                    </Text>
                    {' · '}{formatCategoryLabel(tx.categoryName, tx.categoryGroup)}
                    {tx.cardIssuer && (() => {
                      const bank = getBankInfo(tx.cardIssuer);
                      return bank ? ` · ${bank.shortName}` : '';
                    })()}
                    {tx.createdByName ? ` · ${tx.createdByName}` : ''}
                  </Text>
                </View>
                <View style={styles.txAmountContainer}>
                  <Text style={[styles.txAmount, { color: tx.type === 'income' ? Colors.Income : Colors.Expense }]}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </Text>
                  <Text style={styles.txDate}>{formatDateTime(tx.date)}</Text>
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        )) : (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>거래 내역이 없어요</Text>
          </GlassCard>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
      <ScrollToTopButton scrollY={scrollY} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
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
            {/* 년도 조작 */}
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
                      pickerStyles.monthBtnText,
                      isSelected && pickerStyles.monthBtnTextActive,
                      isFuture && pickerStyles.monthBtnTextDisabled
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

      <FiscalCycleSettingSheet
        visible={fiscalSheetVisible}
        onClose={() => setFiscalSheetVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.Background },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, position: 'relative' },
  headerRight: { position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthPicker: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  monthLabel: { fontSize: 18, fontWeight: '700', color: Colors.Text },
  householdBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.CardBorder, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  householdLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  householdRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  householdName: { fontSize: 14, fontWeight: '600', color: Colors.Text },
  householdMembers: { fontSize: 12, color: Colors.TextMuted },
  summaryCard: { marginBottom: Spacing.md },
  summaryLabel: { fontSize: 13, color: Colors.TextMuted, marginBottom: 4 },
  summaryAmount: { fontSize: 34, fontWeight: '800', color: Colors.Text, marginBottom: Spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1 },
  summaryDivider: { width: 1, height: 36, backgroundColor: Colors.Divider, marginHorizontal: Spacing.md },
  summarySubLabel: { fontSize: 12, color: Colors.TextMuted, marginBottom: 4 },
  summarySubAmountIncome: { fontSize: 18, fontWeight: '700', color: Colors.Income },
  summarySubAmountBalance: { fontSize: 18, fontWeight: '700', color: Colors.Income },
  chartCard: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.Text, marginBottom: Spacing.md },
  stackedBarContainer: { marginBottom: Spacing.lg },
  stackedBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  barSegment: { height: '100%' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.Divider },
  categoryLeft: { flexDirection: 'row', alignItems: 'center' },
  categoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.sm },
  categoryIcon: { marginRight: Spacing.sm },
  categoryName: { fontSize: 14, color: Colors.Text, fontWeight: '500' },
  categoryRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  categoryAmount: { fontSize: 14, fontWeight: '600', color: Colors.Text },
  categoryPct: { fontSize: 12, color: Colors.TextMuted, width: 42, textAlign: 'right' },
  emptyCard: { marginBottom: Spacing.md, alignItems: 'center', paddingVertical: Spacing.xl },
  emptyText: { fontSize: 15, color: Colors.TextSecondary, fontWeight: '500', marginTop: Spacing.sm },
  emptySubText: { fontSize: 13, color: Colors.TextMuted, marginTop: 4 },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  txCard: { marginBottom: Spacing.sm, paddingVertical: 16, paddingHorizontal: Spacing.md },
  txRow: { flexDirection: 'row', alignItems: 'center' },
  txIcon: { marginRight: 14 },
  txInfo: { flex: 1 },
  txDescription: { fontSize: 15, fontWeight: '600', color: Colors.Text, marginBottom: 2 },
  txMeta: { fontSize: 12, color: Colors.TextMuted },
  txAmountContainer: { alignItems: 'flex-end' },
  txDate: { fontSize: 11, color: Colors.TextMuted, marginTop: 2 },
  txAmount: { fontSize: 16, fontWeight: '700' },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.Primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: 24,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.Surface,
    borderRadius: 20,
    padding: 4,
    marginBottom: Spacing.md,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 16,
  },
  segmentBtnActive: {
    backgroundColor: Colors.Primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  filterHint: {
    fontSize: 12,
    color: Colors.TextMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  pendingBell: {
    marginLeft: 12,
    position: 'relative',
  },
  pendingBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: Colors.Expense,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pendingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  fabIcon: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  fixedCostHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  fixedCostTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  fixedCostTotal: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.Expense,
    marginLeft: 8,
  },
  fixedCostRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: Colors.Divider,
  },
  fixedCostRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  fixedCostBadge: {
    fontSize: 10,
    fontWeight: '600' as const,
    minWidth: 28,
    textAlign: 'center' as const,
  },
  fixedCostMore: {
    alignItems: 'center' as const,
    paddingVertical: 8,
    marginTop: 4,
  },
  fixedCostMoreText: {
    fontSize: 12,
    color: Colors.Primary,
    fontWeight: '600' as const,
  },
});

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
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
    marginBottom: 16,
    paddingHorizontal: 8,
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
    width: '23%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.Background,
  },
  monthBtnActive: {
    backgroundColor: Colors.Primary,
  },
  monthBtnDisabled: {
    opacity: 0.3,
  },
  monthBtnText: {
    fontSize: 14,
    color: Colors.Text,
    fontWeight: '500',
  },
  monthBtnTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  monthBtnTextDisabled: {
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

export default DashboardScreen;
