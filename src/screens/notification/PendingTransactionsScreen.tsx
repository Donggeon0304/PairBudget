import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  StatusBar,
  ActivityIndicator,
  TextInput,
  Modal,
  Dimensions,
  TouchableWithoutFeedback,
  RefreshControl,
  AppState,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../../theme/colors';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { GlassCard } from '../../components/GlassCard';
import CategorySelectModal from '../../components/CategorySelectModal';
import { useAlert } from '../../components/CustomAlert';
import { formatCurrency } from '../../utils/formatCurrency';
import { useAuth } from '../../contexts/AuthContext';
import { getPendingTransactions, removePendingTransaction, getCoupleAccountBanks, learnCategoryMapping, addRejectedHash } from '../../services/NotificationService';
import { getLearnedMapping, initCategoryMapper, autoMapCategory } from '../../services/CategoryAutoMapper';
import { generateTransactionHash, getBrandName } from '../../services/BankNotificationParser';
import { useHousehold } from '../../contexts/HouseholdContext';
import { PendingTransaction, Category } from '../../types';
import { formatCategoryLabel } from '../../utils/formatCategory';
import { useFocusEffect } from '@react-navigation/native';
import { scrapeSmsTransactions } from '../../services/SmsScrapingService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PendingTransactionsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { household, categories: householdCategories } = useHousehold();
  const { showAlert } = useAlert();
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Record<string, Category | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coupleBanks, setCoupleBanks] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);

  // 공동/개인 수동 오버라이드
  const [coupleOverride, setCoupleOverride] = useState<Record<string, boolean>>({});

  // 카테고리 모달
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryModalItemId, setCategoryModalItemId] = useState<string | null>(null);
  const [categoryModalType, setCategoryModalType] = useState<'expense' | 'income'>('expense');

  // 수정 모달
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalItem, setEditModalItem] = useState<PendingTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // 편집 결과 저장 (모달 닫힌 후에도 유지)
  const [editedValues, setEditedValues] = useState<Record<string, { amount?: number; description?: string }>>({});

  // 메모(원문) 펼치기/접기
  const [expandedMemo, setExpandedMemo] = useState<Record<string, boolean>>({});

  // 알림 가져오기 상태
  const [isScraping, setIsScraping] = useState(false);
  const [showScrapeModal, setShowScrapeModal] = useState(false);

  // Firestore 거래 내역 기반 카테고리 매핑 (description → category)
  const [merchantCategoryMap, setMerchantCategoryMap] = useState<Record<string, { categoryId: string; categoryName: string; categoryGroup: string; categoryIcon: string }>>({});

  const loadPending = useCallback(async () => {
    try {
      setIsLoading(true);
      let data = await getPendingTransactions();

      // 🟢 공동통장 중복 자동 정리: Firestore에 이미 등록된 거래는 대기 목록에서 제거
      if (user?.householdId && data && data.length > 0) {
        const toRemoveIds: string[] = [];

        for (const item of data) {
          if (!item.parsed.amount) continue;
          const txHash = generateTransactionHash(
            item.parsed.amount,
            item.parsed.merchant,
            item.parsed.dateTime,
            item.parsed.cardIssuer,
            item.receivedAt,
          );
          try {
            const snap = await firestore()
              .collection('households')
              .doc(user.householdId)
              .collection('transactions')
              .where('txHash', '==', txHash)
              .limit(1)
              .get();
            if (!snap.empty) {
              toRemoveIds.push(item.id);
            }
          } catch (e) {
            // Firestore 에러 시 해당 항목은 그냥 유지
          }
        }

        if (toRemoveIds.length > 0) {
          for (const id of toRemoveIds) {
            await removePendingTransaction(id);
          }
          data = data.filter(d => !toRemoveIds.includes(d.id));
          console.log(`[PairBudget] 공동 거래 자동 정리: ${toRemoveIds.length}건 제거`);
        }
      }

      setPendingTransactions(data || []);

      // 🟢 Firestore 실제 거래 내역에서 카테고리 매핑 구성
      // 1) 가맹점별 정확 일치 조회 → 기간 제한 없이 확실히 찾음
      // 2) 최근 200건 일괄 로드 → 가맹점명이 다를 때 퍼지 매칭용
      if (user?.householdId && data && data.length > 0) {
        try {
          const catMap: Record<string, { categoryId: string; categoryName: string; categoryGroup: string; categoryIcon: string }> = {};

          // 대기 내역에서 고유한 가맹점명 추출
          const uniqueMerchants = new Set<string>();
          for (const item of data) {
            const merchant = (item.parsed.merchant || '').trim();
            if (merchant && merchant.length >= 2) {
              uniqueMerchants.add(merchant);
            }
          }

          // [병렬 실행] 가맹점별 정확 일치 쿼리 + 최근 200건 벌크 로드
          const exactQueries = Array.from(uniqueMerchants).map(async (merchant) => {
            try {
              const snap = await firestore()
                .collection('households')
                .doc(user.householdId!)
                .collection('transactions')
                .where('description', '==', merchant)
                .orderBy('date', 'desc')
                .limit(1)
                .get();

              if (!snap.empty) {
                const tx = snap.docs[0].data();
                catMap[merchant] = {
                  categoryId: tx.categoryId || '',
                  categoryName: tx.categoryName || '',
                  categoryGroup: tx.categoryGroup || tx.categoryName || '',
                  categoryIcon: tx.categoryIcon || 'cash-outline',
                };
              }
            } catch (_) { /* 개별 실패 시 스킵 */ }
          });

          const bulkQuery = (async () => {
            try {
              const snap = await firestore()
                .collection('households')
                .doc(user.householdId!)
                .collection('transactions')
                .orderBy('date', 'desc')
                .limit(500)
                .get();

              snap.docs.forEach(doc => {
                const tx = doc.data();
                const desc = (tx.description || '').trim();
                // 정확 일치가 이미 있으면 덮어쓰지 않음 (정확 일치가 우선)
                if (desc && !catMap[desc]) {
                  catMap[desc] = {
                    categoryId: tx.categoryId || '',
                    categoryName: tx.categoryName || '',
                    categoryGroup: tx.categoryGroup || tx.categoryName || '',
                    categoryIcon: tx.categoryIcon || 'cash-outline',
                  };
                }
              });
            } catch (_) { /* 벌크 로드 실패 시 정확 일치 결과만 사용 */ }
          })();

          await Promise.all([...exactQueries, bulkQuery]);
          setMerchantCategoryMap(catMap);
        } catch (e) {
          console.warn('[PairBudget] Firestore 카테고리 매핑 로드 실패:', e);
        }
      }
    } catch (e) {
      console.error('Failed to load pending transactions:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.householdId]);

  // 화면 포커스 시마다 자동 새로고침 (알림 탭 → 재진입 시 포함)
  useFocusEffect(
    useCallback(() => {
      // 학습된 카테고리 매핑 로드 (앱 재시작 후 메모리가 비어있을 수 있으므로)
      initCategoryMapper().then(() => {
        loadPending();
      });
      getCoupleAccountBanks().then(banks => setCoupleBanks(banks));
    }, [loadPending])
  );

  // 앱이 백그라운드에서 돌아올 때 자동 새로고침 (이미 이 화면에 있는 상태에서 알림 수신 후 복귀)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadPending();
      }
    });
    return () => subscription.remove();
  }, [loadPending]);

  useEffect(() => {
    if (household?.coupleAccountBanks && household.coupleAccountBanks.length > 0) {
      setCoupleBanks(household.coupleAccountBanks);
    }
  }, [household?.coupleAccountBanks]);

  /** 날짜 역순 정렬된 데이터 */
  const sortedTransactions = [...pendingTransactions].sort((a, b) => {
    const dateA = a.receivedAt instanceof Date ? a.receivedAt.getTime() : new Date(a.receivedAt).getTime();
    const dateB = b.receivedAt instanceof Date ? b.receivedAt.getTime() : new Date(b.receivedAt).getTime();
    return dateB - dateA;
  });

  /** 공동 여부 결정 */
  const getIsCouple = (item: PendingTransaction): boolean => {
    if (coupleOverride[item.id] !== undefined) return coupleOverride[item.id];
    if (coupleBanks.length > 0 && item.parsed.packageName) {
      return coupleBanks.includes(item.parsed.packageName);
    }
    return item.isCouple || false;
  };

  /** 수입/지출 타입 결정 */
  const getTransactionType = (item: PendingTransaction): 'income' | 'expense' => {
    return item.parsed.incomeOrExpense === 'income' ? 'income' : 'expense';
  };

  /** 편집된 값 또는 원본 값 가져오기 */
  const getAmount = (item: PendingTransaction): number => {
    return editedValues[item.id]?.amount ?? item.parsed.amount ?? 0;
  };

  const getDescription = (item: PendingTransaction): string => {
    return editedValues[item.id]?.description ?? item.parsed.merchant ?? '';
  };

  /** 기본 카테고리 결정 — Firestore 실제 내역 우선, 학습/브랜드 fallback */
  const getDefaultCategory = (item: PendingTransaction): Category | undefined => {
    const txType = getTransactionType(item);
    if (txType === 'income') {
      const incomeCat = householdCategories.find(c => c.type === 'income');
      return incomeCat;
    }

    const merchant = item.parsed.merchant;
    if (merchant) {
      // 1차: Firestore 실제 거래 내역에서 카테고리 찾기 (정확 일치)
      const exactMatch = merchantCategoryMap[merchant];
      if (exactMatch) {
        const cat = householdCategories.find(c =>
          c.id === exactMatch.categoryId || c.name === exactMatch.categoryName
        );
        if (cat) return cat;
      }

      // 2차: Firestore 내역에서 퍼지 매칭 (부분 문자열 포함)
      const merchantNorm = merchant.replace(/\s+/g, '');
      if (merchantNorm.length >= 3) {
        for (const [desc, catInfo] of Object.entries(merchantCategoryMap)) {
          const descNorm = desc.replace(/\s+/g, '');
          if (descNorm.length >= 3 && (descNorm.includes(merchantNorm) || merchantNorm.includes(descNorm))) {
            const cat = householdCategories.find(c =>
              c.id === catInfo.categoryId || c.name === catInfo.categoryName
            );
            if (cat) return cat;
          }
        }
      }

      // 3차: AsyncStorage 학습 매핑 (fallback)
      const learned = getLearnedMapping(merchant);
      if (learned) {
        const learnedCat = householdCategories.find(c =>
          c.id === learned.categoryId || c.name === learned.categoryName
        );
        if (learnedCat) return learnedCat;
      }
    }

    // 4차: 백그라운드에서 설정한 suggestedCategory 또는 첨 번째 지출 카테고리
    return item.suggestedCategory || householdCategories.find(c => c.type === 'expense');
  };

  /** 제목 정리 - 핵심만 추출 */
  const getCleanTitle = (item: PendingTransaction): string => {
    const edited = editedValues[item.id]?.description;
    if (edited) return edited;

    const merchant = item.parsed.merchant;
    if (!merchant) {
      const typeLabel = item.parsed.incomeOrExpense === 'income' ? '입금' : '출금';
      return item.parsed.cardIssuer ? `${item.parsed.cardIssuer} ${typeLabel}` : `${typeLabel} 내역`;
    }

    // 계좌번호 패턴 제거
    let clean = merchant
      .replace(/\d{3,4}-\d{2,4}-\d{4,}/g, '') // 계좌번호
      .replace(/\d{4}-\*{4}-\*{4}-\d{4}/g, '') // 카드번호 마스킹
      .replace(/\*{2,}/g, '')                   // 마스킹 문자
      .replace(/\(주\)/g, '')                    // (주)
      .replace(/주식회사/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // 너무 길면 자르기
    if (clean.length > 20) {
      clean = clean.substring(0, 20) + '…';
    }

    if (!clean) {
      const typeLabel = item.parsed.incomeOrExpense === 'income' ? '입금' : '출금';
      return item.parsed.cardIssuer ? `${item.parsed.cardIssuer} ${typeLabel}` : `${typeLabel} 내역`;
    }
    return clean;
  };

  // ─── 등록 핸들러 ──────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (item: PendingTransaction) => {
    try {
      const defaultCat = getDefaultCategory(item);
      const category = selectedCategory[item.id] || defaultCat;
      const txType = getTransactionType(item);

      if (!user?.householdId) {
        showAlert({ title: '오류', message: '소속된 가계부가 없습니다.', icon: 'error' });
        return;
      }

      const amount = getAmount(item);
      const typeLabel = txType === 'income' ? '입금' : '출금';
      const description = getDescription(item) || category?.name || `${typeLabel} 내역`;
      // 공동통장 중복 등록 방지: 해시 기반 체크
      const txHash = generateTransactionHash(
        amount,
        item.parsed.merchant,
        item.parsed.dateTime,
        item.parsed.cardIssuer,
        item.receivedAt,
      );


      const existingSnap = await firestore()
        .collection('households')
        .doc(user.householdId)
        .collection('transactions')
        .where('txHash', '==', txHash)
        .limit(1)
        .get();


      if (!existingSnap.empty) {
        // 이미 등록된 거래 → 대기 목록에서만 제거
        await removePendingTransaction(item.id);
        setPendingTransactions(prev => prev.filter(t => t.id !== item.id));
        showAlert({ title: '알림', message: '이미 등록된 거래입니다. (공동통장 중복 방지)', icon: 'info' });
        return;
      }


      await firestore()
        .collection('households')
        .doc(user.householdId)
        .collection('transactions')
        .add({
          amount,
          type: txType,
          categoryId: category?.id || 'other',
          categoryName: category?.name || '기타',
          categoryGroup: (category as any)?.group || category?.name || '기타',
          categoryIcon: category?.icon || 'cash-outline',
          description,
          date: (() => {
            if (!item.parsed.dateTime) return new Date(item.receivedAt);
            const dt = item.parsed.dateTime;
            // MM/DD HH:MM → YYYY-MM-DDTHH:MM (Hermes 호환 ISO 형식)
            const m = dt.match(/(\d{1,2})\/(\d{1,2})\s+(\d{2}):(\d{2})/);
            if (m) {
              const year = new Date().getFullYear();
              const month = m[1].padStart(2, '0');
              const day = m[2].padStart(2, '0');
              return new Date(`${year}-${month}-${day}T${m[3]}:${m[4]}:00`);
            }
            const parsed = new Date(dt);
            return isNaN(parsed.getTime()) ? new Date(item.receivedAt) : parsed;
          })(),
          createdBy: user.uid,
          createdByName: user.displayName || '',
          source: 'auto',
          cardIssuer: item.parsed.cardIssuer || null,
          isCouple: getIsCouple(item),
          memo: item.parsed.raw || null,
          txHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        });


      await removePendingTransaction(item.id);
      setPendingTransactions(prev => {
        const next = prev.filter(t => t.id !== item.id);
        // 아이템이 적어지면 스크롤 위치 리셋
        if (next.length <= 3) {
          setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
        }
        return next;
      });

      // 학습: merchant → category 매핑 저장
      const merchant = item.parsed.merchant;
      if (merchant && category) {
        await learnCategoryMapping(merchant, category.id, category.name, (category as any).group);
      }

      const resultLabel = txType === 'income' ? '수입' : '지출';
      showAlert({
        title: '등록 완료',
        message: `${description}: ${formatCurrency(amount)} (${resultLabel})`,
        icon: 'success',
      });
    } catch (err: any) {
      console.error('Approve transaction error:', err);
      showAlert({ title: '오류', message: err.message || '등록에 실패했습니다.', icon: 'error' });
    }
  }, [selectedCategory, user, editedValues, coupleBanks, coupleOverride, householdCategories]);

  const handleReject = useCallback(async (item: PendingTransaction) => {
    showAlert({
      title: '내역 제외',
      message: '이 결제 내역을 대기 목록에서 제외하시겠습니까?',
      icon: 'confirm',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '제외',
          style: 'destructive',
          onPress: async () => {
            try {
              // 제외 해시 저장 (SMS 스캔 시 무시)
              if (item.parsed.amount) {
                const hash = generateTransactionHash(
                  item.parsed.amount,
                  item.parsed.merchant,
                  item.parsed.dateTime,
                  item.parsed.cardIssuer,
                  item.receivedAt,
                );
                await addRejectedHash(hash);
              }
              await removePendingTransaction(item.id);
              setPendingTransactions(prev => {
                const next = prev.filter(t => t.id !== item.id);
                if (next.length <= 3) {
                  setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
                }
                return next;
              });
            } catch (err) {
              console.error('Reject transaction error:', err);
            }
          },
        },
      ],
    });
  }, []);

  const handleApproveAll = useCallback(async () => {
    if (pendingTransactions.length === 0 || !user?.householdId) return;

    showAlert({
      title: '전체 등록',
      message: `대기 중인 ${pendingTransactions.length}개 내역을 모두 등록하시겠습니까?`,
      icon: 'confirm',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '등록',
          onPress: async () => {
            let successCount = 0;
            let failCount = 0;
            const failedIds: string[] = [];

            for (const item of pendingTransactions) {
              try {
                const defaultCat = getDefaultCategory(item);
                const category = selectedCategory[item.id] || defaultCat;
                const txType = getTransactionType(item);
                const amount = getAmount(item);
                const typeLabel2 = txType === 'income' ? '입금' : '출금';
                const description = getDescription(item) || category?.name || `${typeLabel2} 내역`;

                if (!amount || amount <= 0) {
                  failedIds.push(item.id);
                  failCount++;
                  continue;
                }

                // 공동통장 중복 등록 방지
                const txHash = generateTransactionHash(
                  amount,
                  item.parsed.merchant,
                  item.parsed.dateTime,
                  item.parsed.cardIssuer,
                  item.receivedAt,
                );

                const dupSnap = await firestore()
                  .collection('households')
                  .doc(user.householdId!)
                  .collection('transactions')
                  .where('txHash', '==', txHash)
                  .limit(1)
                  .get();

                if (!dupSnap.empty) {
                  await removePendingTransaction(item.id);
                  successCount++;
                  continue;
                }

                await firestore()
                  .collection('households')
                  .doc(user.householdId!)
                  .collection('transactions')
                  .add({
                    amount,
                    type: txType,
                    categoryId: category?.id || 'other',
                    categoryName: category?.name || '기타',
                    categoryGroup: (category as any)?.group || category?.name || '기타',
                    categoryIcon: category?.icon || 'cash-outline',
                    description,
                    date: (() => {
                      if (!item.parsed.dateTime) return new Date(item.receivedAt);
                      const dt = item.parsed.dateTime;
                      // MM/DD HH:MM → YYYY-MM-DDTHH:MM (Hermes 호환 ISO 형식)
                      const m = dt.match(/(\d{1,2})\/(\d{1,2})\s+(\d{2}):(\d{2})/);
                      if (m) {
                        const year = new Date().getFullYear();
                        const month = m[1].padStart(2, '0');
                        const day = m[2].padStart(2, '0');
                        return new Date(`${year}-${month}-${day}T${m[3]}:${m[4]}:00`);
                      }
                      const parsed = new Date(dt);
                      return isNaN(parsed.getTime()) ? new Date(item.receivedAt) : parsed;
                    })(),
                    createdBy: user.uid,
                    createdByName: user.displayName || '',
                    source: 'auto',
                    cardIssuer: item.parsed.cardIssuer || null,
                    isCouple: getIsCouple(item),
                    memo: item.parsed.raw || null,
                    txHash,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  });

                await removePendingTransaction(item.id);
                // 학습: merchant → category 매핑 저장
                const merchant = item.parsed.merchant;
                if (merchant && category) {
                  await learnCategoryMapping(merchant, category.id, category.name, (category as any).group);
                }
                successCount++;
              } catch (err: any) {
                console.error(`Failed to register item ${item.id}:`, err);
                failedIds.push(item.id);
                failCount++;
              }
            }

            setPendingTransactions(prev => {
              const next = prev.filter(t => failedIds.includes(t.id));
              setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
              return next;
            });

            if (failCount === 0) {
              showAlert({ title: '완료', message: `${successCount}개 내역이 모두 등록되었습니다.`, icon: 'success' });
            } else {
              showAlert({
                title: '부분 완료',
                message: `${successCount}개 등록, ${failCount}개 실패.\n실패한 항목은 대기 목록에 남아있습니다.`,
                icon: 'warning',
              });
            }
          },
        },
      ],
    });
  }, [pendingTransactions, selectedCategory, user, editedValues, coupleBanks, coupleOverride, householdCategories]);

  // ─── 수정 모달 핸들러 ──────────────────────────────────────────────────────

  const openEditModal = (item: PendingTransaction) => {
    setEditModalItem(item);
    setEditAmount(String(getAmount(item)));
    setEditDescription(getCleanTitle(item));
    setEditModalVisible(true);
  };

  const saveEditModal = () => {
    if (!editModalItem) return;
    const parsedAmount = parseFloat(editAmount.replace(/,/g, ''));
    setEditedValues(prev => ({
      ...prev,
      [editModalItem.id]: {
        amount: isNaN(parsedAmount) ? undefined : parsedAmount,
        description: editDescription.trim() || undefined,
      },
    }));
    setEditModalVisible(false);
    setEditModalItem(null);
  };

  // ─── 카테고리 모달 핸들러 ─────────────────────────────────────────────────

  const openCategoryModal = (item: PendingTransaction) => {
    setCategoryModalItemId(item.id);
    setCategoryModalType(getTransactionType(item));
    setCategoryModalVisible(true);
  };

  const handleCategorySelect = (category: Category) => {
    if (categoryModalItemId) {
      setSelectedCategory(prev => ({ ...prev, [categoryModalItemId]: category }));
    }
  };

  // ─── 알림 가져오기 (SMS + 푸시 알림 통합) ──────────────────────────────────────

  const handleSmsScrape = async (daysBack: number = 7) => {
    if (!user?.householdId) return;
    setShowScrapeModal(false);
    setIsScraping(true);
    try {
      const result = await scrapeSmsTransactions(daysBack, user.householdId);
      const { items: scraped, debug } = result;

      if (scraped.length === 0) {
        const smsInfo = debug.totalSms > 0 ? `문자 ${debug.totalSms}건` : '';
        const pushInfo = (debug as any).pushCount > 0 ? `앱 알림 ${(debug as any).pushCount}건` : '';
        const scannedInfo = [smsInfo, pushInfo].filter(Boolean).join(' + ');

        showAlert({
          title: '알림 스캔 완료',
          message: !scannedInfo
            ? `최근 ${daysBack}일 내 알림이 없습니다.`
            : debug.parsedCount === 0
              ? `${scannedInfo}을 스캔했지만 금융 알림이 없습니다.`
              : `${scannedInfo} 스캔 완료.\n${debug.parsedCount}건이 모두 이미 등록되었거나 제외된 내역입니다 ✅`,
          icon: debug.totalSms === 0 && (debug as any).pushCount === 0 ? 'warning' : 'success',
          buttons: [{ text: '확인' }],
        });
        return;
      }

      // 스크래핑된 항목을 pending 형식으로 변환 (카테고리 자동 매핑 포함)
      const newPending: PendingTransaction[] = scraped.map(sms => {
        let suggestedCategory: Category | undefined;
        if (sms.parsed.merchant) {
          const learned = getLearnedMapping(sms.parsed.merchant);
          if (learned) {
            const cat = householdCategories.find(c => c.id === learned.categoryId || c.name === learned.categoryName);
            if (cat) suggestedCategory = cat;
          }
          if (!suggestedCategory) {
            const catName = autoMapCategory(sms.parsed.merchant);
            if (catName) {
              const cat = householdCategories.find(c => c.name === catName);
              if (cat) suggestedCategory = cat;
            }
          }
        }
        return {
          id: sms.id,
          parsed: sms.parsed,
          receivedAt: sms.smsDate,
          status: 'pending' as const,
          isCouple: false,
          suggestedCategory,
        };
      });

      // source별 건수 계산
      const smsCount = scraped.filter((s: any) => s.source === 'sms').length;
      const pushCountResult = scraped.filter((s: any) => s.source === 'push').length;
      const sourceDetail = smsCount > 0 && pushCountResult > 0
        ? `(문자 ${smsCount}건 + 앱 알림 ${pushCountResult}건)`
        : '';

      setPendingTransactions(prev => [...newPending, ...prev]);
      showAlert({
        title: '알림 스캔 완료 📨',
        message: `미등록 거래 ${scraped.length}건을 찾았습니다. ${sourceDetail}\n확인 후 등록해주세요!`,
        icon: 'info',
        buttons: [{ text: '확인' }],
      });
    } catch (error: any) {
      showAlert({
        title: '오류',
        message: `알림 스캔 중 오류가 발생했습니다.\n${error.message || ''}`,
        icon: 'error',
        buttons: [{ text: '확인' }],
      });
    } finally {
      setIsScraping(false);
    }
  };

  // ─── 렌더링 ────────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: PendingTransaction }) => {
    const txType = getTransactionType(item);
    const defaultCat = getDefaultCategory(item);
    const currentCategory = selectedCategory[item.id] || defaultCat;
    const isIncome = txType === 'income';
    const displayAmount = getAmount(item);
    const title = getCleanTitle(item);
    const isMemoExpanded = expandedMemo[item.id] || false;
    const rawText = item.parsed.raw || '';

    return (
      <GlassCard style={styles.transactionCard}>
        {/* 상단: 은행 + 배지 + 금액 */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.bankBadge, { backgroundColor: isIncome ? 'rgba(68, 138, 255, 0.1)' : 'rgba(46, 204, 113, 0.1)' }]}>
              <Icon name={isIncome ? 'trending-up-outline' : 'card-outline'} size={20} color={isIncome ? Colors.Income : Colors.Primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.cardIssuerRow}>
                <Text style={styles.cardIssuer}>{item.parsed.cardIssuer || getBrandName(item.parsed.packageName || '') || '결제 내역'}</Text>
                <View style={[styles.typeBadge, { backgroundColor: isIncome ? Colors.Income + '18' : Colors.Expense + '18' }]}>
                  <Text style={[styles.typeBadgeText, { color: isIncome ? Colors.Income : Colors.Expense }]}>
                    {isIncome ? '입금' : '출금'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCoupleOverride(prev => ({ ...prev, [item.id]: !getIsCouple(item) }))}
                  activeOpacity={0.6}
                >
                  <View style={[styles.typeBadge, { backgroundColor: getIsCouple(item) ? Colors.Primary + '18' : Colors.TextMuted + '18' }]}>
                    <Text style={[styles.typeBadgeText, { color: getIsCouple(item) ? Colors.Primary : Colors.TextMuted }]}>
                      {getIsCouple(item) ? '공동' : '개인'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardTime}>{item.parsed.dateTime || (() => { const d = new Date(item.receivedAt); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}</Text>
            </View>
          </View>
          <Text style={[styles.amount, { color: isIncome ? Colors.Income : Colors.Expense }]}>
            {isIncome ? '+' : '-'}{formatCurrency(displayAmount)}
          </Text>
        </View>

        {/* 제목 (간결) */}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>

        {/* 원문 메모 (접을 수 있음) */}
        {rawText.length > 0 && (
          <TouchableOpacity
            style={styles.memoToggle}
            onPress={() => setExpandedMemo(prev => ({ ...prev, [item.id]: !isMemoExpanded }))}
            activeOpacity={0.6}
          >
            <Icon name={isMemoExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.TextMuted} />
            <Text style={styles.memoToggleText}>{isMemoExpanded ? '원문 접기' : '원문 보기'}</Text>
          </TouchableOpacity>
        )}
        {isMemoExpanded && (
          <View style={styles.memoBox}>
            <Text style={styles.memoText}>{rawText}</Text>
          </View>
        )}

        {/* 수정 버튼 */}
        <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(item)}>
          <Icon name="create-outline" size={14} color={Colors.TextSecondary} />
          <Text style={styles.editButtonText}>금액/설명 수정</Text>
        </TouchableOpacity>

        {/* 카테고리 선택 버튼 */}
        <TouchableOpacity style={styles.categoryButton} onPress={() => openCategoryModal(item)}>
          {currentCategory ? (
            <>
              <View style={[styles.catBtnIcon, { backgroundColor: currentCategory.color + '18' }]}>
                <Icon name={currentCategory.icon || 'cash-outline'} size={16} color={currentCategory.color} />
              </View>
              <Text style={styles.catBtnText}>{formatCategoryLabel(currentCategory.name, (currentCategory as any).group)}</Text>
            </>
          ) : (
            <>
              <Icon name="grid-outline" size={16} color={Colors.TextSecondary} />
              <Text style={[styles.catBtnText, { color: Colors.TextSecondary }]}>카테고리 선택</Text>
            </>
          )}
          <Icon name="chevron-forward" size={16} color={Colors.TextMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* 등록/제외 버튼 */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.rejectButton} onPress={() => handleReject(item)}>
            <Text style={styles.rejectButtonText}>제외</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveButton, isIncome && { backgroundColor: Colors.Income }]}
            onPress={() => handleApprove(item)}
          >
            <Text style={styles.approveButtonText}>등록</Text>
          </TouchableOpacity>
        </View>
      </GlassCard>
    );
  };

  // ─── 로딩 ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
        <ActivityIndicator size="large" color={Colors.Primary} />
        <Text style={{ marginTop: Spacing.md, color: Colors.TextSecondary, fontSize: 14 }}>
          알림 내역을 불러오는 중...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
      <FlatList
        ref={flatListRef}
        data={sortedTransactions}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={sortedTransactions.length === 0 ? {flex: 1} : styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonContainer}>
                <Icon name="chevron-back" size={24} color={Colors.Text} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>승인 대기 내역</Text>
              {pendingTransactions.length > 0 ? (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{pendingTransactions.length}</Text>
                </View>
              ) : (
                <View style={{ width: 28 }} />
              )}
            </View>
            {sortedTransactions.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.approveAllButton, { flex: 1 }]} onPress={handleApproveAll}>
                  <Text style={styles.approveAllText}>
                    전체 등록 ({pendingTransactions.length}개)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: BorderRadius.md,
                    backgroundColor: Colors.Surface,
                    borderWidth: 1,
                    borderColor: Colors.Primary + '30',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setShowScrapeModal(true)}
                  disabled={isScraping}
                >
                  {isScraping ? (
                    <ActivityIndicator size="small" color={Colors.Primary} />
                  ) : (
                    <Icon name="download-outline" size={20} color={Colors.Primary} />
                  )}
                </TouchableOpacity>
              </View>
            )}
            {sortedTransactions.length === 0 && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: BorderRadius.md,
                  backgroundColor: Colors.Primary + '10',
                  borderWidth: 1,
                  borderColor: Colors.Primary + '25',
                }}
                onPress={() => setShowScrapeModal(true)}
                disabled={isScraping}
              >
                {isScraping ? (
                  <ActivityIndicator size="small" color={Colors.Primary} />
                ) : (
                  <Icon name="download-outline" size={18} color={Colors.Primary} />
                )}
                <Text style={{ color: Colors.Primary, fontWeight: '600', fontSize: 14 }}>
                  {isScraping ? '알림 스캔 중...' : '알림 가져오기'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="notifications-off-outline" size={64} color={Colors.TextMuted} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>대기 중인 내역이 없습니다</Text>
            <Text style={styles.emptySubtitle}>
              은행 및 카드 결제 알림이 오면{'\n'}여기에 자동으로 등록 대기 내역으로 나타납니다
            </Text>
            <TouchableOpacity
              style={{
                marginTop: Spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 24,
                backgroundColor: Colors.Primary,
              }}
              onPress={() => setShowScrapeModal(true)}
              disabled={isScraping}
            >
              {isScraping ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Icon name="download-outline" size={18} color="#FFF" />
              )}
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>
                {isScraping ? '알림 스캔 중...' : '알림 가져오기'}
              </Text>
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadPending();
              setRefreshing(false);
            }}
            tintColor={Colors.Primary}
            colors={[Colors.Primary]}
          />
        }
      />

      {/* ─── 카테고리 선택 모달 ─── */}
      <CategorySelectModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        onSelect={handleCategorySelect}
        categories={householdCategories}
        selectedId={(() => {
          if (!categoryModalItemId) return undefined;
          // 수동 변경된 카테고리가 있으면 그것을 사용
          const manual = selectedCategory[categoryModalItemId];
          if (manual) return manual.id || manual.name;
          // 없으면 현재 표시중인 기본 카테고리를 사용
          const pendingItem = pendingTransactions.find(t => t.id === categoryModalItemId);
          if (pendingItem) {
            const defaultCat = getDefaultCategory(pendingItem);
            if (defaultCat) return defaultCat.id || defaultCat.name;
          }
          return undefined;
        })()}
        type={categoryModalType}
      />

      {/* ─── 수정 모달 ─── */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}>
          <View style={styles.editModalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.editModalContainer}>
                <Text style={styles.editModalTitle}>금액 / 설명 수정</Text>

                <Text style={styles.editModalLabel}>금액</Text>
                <TextInput
                  style={styles.editModalInput}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="numeric"
                  placeholder="금액 입력"
                  placeholderTextColor={Colors.TextMuted}
                  selectTextOnFocus
                />

                <Text style={styles.editModalLabel}>설명 (제목)</Text>
                <TextInput
                  style={[styles.editModalInput, styles.editModalInputMulti]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="어디서 사용했는지 입력"
                  placeholderTextColor={Colors.TextMuted}
                  multiline
                  numberOfLines={2}
                />

                <View style={styles.editModalActions}>
                  <TouchableOpacity
                    style={styles.editModalCancel}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={styles.editModalCancelText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editModalSave}
                    onPress={saveEditModal}
                  >
                    <Text style={styles.editModalSaveText}>저장</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── 알림 가져오기 날짜 선택 모달 ─── */}
      <Modal
        visible={showScrapeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScrapeModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowScrapeModal(false)}>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: Colors.Surface,
                borderRadius: 16,
                paddingVertical: 24,
                paddingHorizontal: 20,
                width: '85%',
                maxWidth: 340,
              }}>
                <Text style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: Colors.Text,
                  textAlign: 'center',
                  marginBottom: 6,
                }}>
                  알림 가져오기
                </Text>
                <Text style={{
                  fontSize: 13,
                  color: Colors.TextSecondary,
                  textAlign: 'center',
                  marginBottom: 20,
                }}>
                  문자 + 금융앱 알림을 함께 가져옵니다
                </Text>
                {[
                  { label: '1일', days: 1 },
                  { label: '3일', days: 3 },
                  { label: '7일', days: 7 },
                  { label: '14일', days: 14 },
                  { label: '30일', days: 30 },
                ].map(({ label, days }) => (
                  <TouchableOpacity
                    key={days}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      backgroundColor: days === 7 ? Colors.Primary + '15' : Colors.Background,
                      borderWidth: 1,
                      borderColor: days === 7 ? Colors.Primary + '40' : Colors.CardBorder,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={() => handleSmsScrape(days)}
                  >
                    <Text style={{
                      fontSize: 15,
                      fontWeight: days === 7 ? '700' : '500',
                      color: days === 7 ? Colors.Primary : Colors.Text,
                    }}>
                      최근 {label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={{ marginTop: 4, alignItems: 'center', paddingVertical: 8 }}
                  onPress={() => setShowScrapeModal(false)}
                >
                  <Text style={{ color: Colors.TextMuted, fontSize: 14 }}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.Background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  backButtonContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: Colors.Text,
    fontSize: 20,
    fontWeight: '700',
  },
  badgeContainer: {
    backgroundColor: Colors.Accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  approveAllButton: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approveAllText: {
    color: Colors.Primary,
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 24,
  },
  transactionCard: {
    marginBottom: Spacing.md,
  },

  // Card Header
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardIssuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIssuer: {
    color: Colors.Text,
    fontSize: 14,
    fontWeight: '600',
  },
  cardTime: {
    color: Colors.TextMuted,
    fontSize: 12,
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Title (간결)
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: 4,
    paddingLeft: 52,
  },

  // 원문 메모
  memoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 52,
    marginBottom: 8,
  },
  memoToggleText: {
    fontSize: 12,
    color: Colors.TextMuted,
  },
  memoBox: {
    marginLeft: 52,
    marginBottom: 12,
    backgroundColor: Colors.Background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.CardBorder,
  },
  memoText: {
    fontSize: 12,
    color: Colors.TextSecondary,
    lineHeight: 18,
  },

  // 수정 버튼
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 52,
    marginBottom: 12,
    gap: 4,
  },
  editButtonText: {
    color: Colors.TextSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  // 카테고리 선택 버튼
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.Background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 10,
  },
  catBtnIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.Text,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    alignItems: 'center',
    backgroundColor: Colors.Surface,
  },
  rejectButtonText: {
    color: Colors.TextSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  approveButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.Primary,
    alignItems: 'center',
  },
  approveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Empty
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
  },
  emptyIcon: {
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.Text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: Colors.TextSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  // 수정 모달
  editModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  editModalContainer: {
    width: SCREEN_WIDTH - Spacing.xl * 2,
    maxWidth: 360,
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.lg + 4,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: 20,
  },
  editModalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TextSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editModalInput: {
    backgroundColor: Colors.Background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.Text,
    marginBottom: 16,
  },
  editModalInputMulti: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  editModalCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.CardBorder,
    alignItems: 'center',
  },
  editModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  editModalSave: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.Primary,
    alignItems: 'center',
  },
  editModalSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default PendingTransactionsScreen;
