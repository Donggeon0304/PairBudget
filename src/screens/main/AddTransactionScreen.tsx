/**
 * PairBudget 거래 추가/수정 화면
 * 지출/수입 등록 및 수정/삭제 - 금액 입력, 카테고리 선택, 상세 정보
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Animated,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/Ionicons';
import CategoryIcon from '../../components/CategoryIcon';
import { useAlert } from '../../components/CustomAlert';
import { Colors } from '../../theme/colors';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { formatCurrency } from '../../utils/formatCurrency';
import { useAuth } from '../../contexts/AuthContext';
import { useHousehold } from '../../contexts/HouseholdContext';
import { useRoute, useNavigation } from '@react-navigation/native';
import { DEFAULT_CATEGORIES, Transaction, Category } from '../../types';
import CategorySelectModal from '../../components/CategorySelectModal';
import { formatCategoryLabel } from '../../utils/formatCategory';
import { learnCategoryMapping } from '../../services/CategoryAutoMapper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_PAD_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 2) / 3;

// ─── Number Pad Keys ─────────────────────────────────────────────────────────

const NUM_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['00', '0', '⌫'],
];

// ─── Component ───────────────────────────────────────────────────────────────

const AddTransactionScreen: React.FC = () => {
  const { user } = useAuth();
  const { household, categories: householdCategories, addCategory } = useHousehold();
  const { showAlert } = useAlert();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const editTx = route.params?.editTransaction as Transaction | undefined;
  const isEditMode = !!editTx;

  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [amountStr, setAmountStr] = useState('0');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [description, setDescription] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCoupleAccount, setIsCoupleAccount] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [showNumPad, setShowNumPad] = useState(false);
  const [showCategorySelectModal, setShowCategorySelectModal] = useState(false);

  const scrollViewRef = useRef<any>(null);

  const amountScale = useRef(new Animated.Value(1)).current;

  const accentColor = txType === 'expense' ? Colors.Expense : Colors.Income;

  // Use household categories if available, otherwise defaults
  const allCategories = householdCategories.length > 0
    ? householdCategories
    : DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: String(i) }));
  const categories = allCategories.filter((c) => c.type === txType);

  const amountNumber = parseInt(amountStr, 10) || 0;

  // 수정 모드일 때 초기값 설정 (마운트 시 1회만)
  const editInitialized = useRef(false);
  useEffect(() => {
    if (editTx && !editInitialized.current) {
      editInitialized.current = true;
      setTxType(editTx.type || 'expense');
      setAmountStr(String(editTx.amount || 0));
      setDescription(editTx.description || '');
      setMemo(editTx.memo || '');
      setSelectedDate(editTx.date instanceof Date ? editTx.date : new Date(editTx.date));
      setIsCoupleAccount(editTx.isCouple || false);
    }
  }, [editTx]);

  // 수정 모드 카테고리 매칭 (초기 1회만)
  const catInitialized = useRef(false);
  useEffect(() => {
    if (editTx && categories.length > 0 && !catInitialized.current) {
      const catIdx = categories.findIndex(
        c => c.id === editTx.categoryId || c.name === editTx.categoryName,
      );
      if (catIdx >= 0) {
        catInitialized.current = true;
        setSelectedCategory(categories[catIdx]);
      }
    }
  }, [editTx, categories]);

  // Bounce animation for amount
  const bounceAmount = useCallback(() => {
    Animated.sequence([
      Animated.timing(amountScale, {
        toValue: 1.05,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(amountScale, {
        toValue: 1,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [amountScale]);

  const handleNumPress = useCallback(
    (key: string) => {
      if (key === '⌫') {
        setAmountStr((prev) => {
          if (prev.length <= 1) return '0';
          return prev.slice(0, -1);
        });
      } else if (key === '00') {
        setAmountStr((prev) => {
          if (prev === '0') return '0';
          if (prev.length >= 10) return prev;
          return prev + '00';
        });
      } else {
        setAmountStr((prev) => {
          if (prev === '0') return key;
          if (prev.length >= 10) return prev;
          return prev + key;
        });
      }
      bounceAmount();
    },
    [bounceAmount],
  );

  const handleTypeToggle = (type: 'expense' | 'income') => {
    setTxType(type);
    setSelectedCategory(null);
  };

  const generatePastelColor = (): string => {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 75%)`;
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      showAlert({ title: '알림', message: '카테고리 이름을 입력해주세요.', icon: 'warning' });
      return;
    }
    setIsAddingCategory(true);
    try {
      await addCategory({
        name: trimmed,
        group: '기타',
        icon: txType === 'expense' ? 'cart-outline' : 'cash-outline',
        type: txType,
        color: generatePastelColor(),
        order: categories.length,
        isDefault: false,
      });
      setNewCategoryName('');
      setShowCategoryModal(false);
    } catch (err: any) {
      showAlert({ title: '오류', message: err.message || '카테고리 추가 실패', icon: 'error' });
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleSave = async () => {
    if (amountNumber === 0 || !selectedCategory || !user?.householdId) return;
    const cat = selectedCategory;
    setIsSaving(true);
    try {
      if (isEditMode && editTx) {
        // 수정 모드: 기존 거래 업데이트
        await firestore()
          .collection('households')
          .doc(user.householdId)
          .collection('transactions')
          .doc(editTx.id)
          .update({
            amount: amountNumber,
            type: txType,
            categoryId: cat.id,
            categoryName: cat.name,
            categoryGroup: cat?.group || cat?.name || '기타',
            categoryIcon: cat.icon,
            description: description || cat.name,
            date: selectedDate,
            isCouple: isCoupleAccount,
            memo: memo || null,
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        showAlert({
          title: '완료',
          message: '거래가 수정되었습니다.',
          icon: 'success',
          buttons: [
            { text: '확인', onPress: () => navigation.goBack() },
          ],
        });
        // 수정 시 카테고리 학습 갱신 (다음 동일 가맹점 거래 시 수정된 카테고리로 제안)
        const desc = description || cat.name;
        if (desc && desc.length >= 2) {
          await learnCategoryMapping(desc, cat.id, cat.name, (cat as any).group);
        }
      } else {
        // 신규 등록 모드
        await firestore()
          .collection('households')
          .doc(user.householdId)
          .collection('transactions')
          .add({
            amount: amountNumber,
            type: txType,
            categoryId: cat.id,
            categoryName: cat.name,
            categoryGroup: cat?.group || cat?.name || '기타',
            categoryIcon: cat.icon,
            description: description || cat.name,
            date: selectedDate,
            createdBy: user.uid,
            createdByName: user.displayName || '',
            source: 'manual',
            isCouple: isCoupleAccount,
            memo: memo || null,
            createdAt: firestore.FieldValue.serverTimestamp(),
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        setAmountStr('0');
        setSelectedCategory(null);
        setDescription('');
        setMemo('');
        setIsCoupleAccount(false);
        // 수동 추가 시에도 카테고리 학습
        const desc = description || cat.name;
        if (desc && desc.length >= 2) {
          await learnCategoryMapping(desc, cat.id, cat.name, (cat as any).group);
        }
        showAlert({ title: '완료', message: `${txType === 'expense' ? '지출' : '수입'} ${formatCurrency(amountNumber)} 등록!`, icon: 'success' });
      }
    } catch (err: any) {
      showAlert({ title: '오류', message: err.message || '저장 실패', icon: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditMode || !editTx || !user?.householdId) return;
    showAlert({
      title: '거래 삭제',
      message: '이 거래를 삭제하시겠습니까?\n삭제된 거래는 복구할 수 없습니다.',
      icon: 'delete',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await firestore()
                .collection('households')
                .doc(user.householdId)
                .collection('transactions')
                .doc(editTx.id)
                .delete();
              showAlert({
                title: '완료',
                message: '거래가 삭제되었습니다.',
                icon: 'success',
                buttons: [
                  { text: '확인', onPress: () => navigation.goBack() },
                ],
              });
            } catch (err: any) {
              showAlert({ title: '오류', message: err.message || '삭제 실패', icon: 'error' });
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    });
  };

  const formatDateOnly = (date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[date.getDay()];
    return `${year}년 ${month}월 ${day}일(${dayName})`;
  };

  const formatTimeOnly = (date: Date): string => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? '오후' : '오전';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${ampm} ${displayHours}:${displayMinutes}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
        >
          {/* ─── Type Toggle ─── */}
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                txType === 'expense' && {
                  backgroundColor: Colors.Expense,
                },
              ]}
              onPress={() => handleTypeToggle('expense')}
            >
              <Text
                style={[
                  styles.typeText,
                  txType === 'expense' && styles.typeTextActive,
                ]}
              >
                지출
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                txType === 'income' && {
                  backgroundColor: Colors.Income,
                },
              ]}
              onPress={() => handleTypeToggle('income')}
            >
              <Text
                style={[
                  styles.typeText,
                  txType === 'income' && styles.typeTextActive,
                ]}
              >
                수입
              </Text>
            </TouchableOpacity>
          </View>

          {/* ─── Amount Display (탭하면 숫자패드 토글) ─── */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowNumPad(!showNumPad)}
          >
            <Animated.View
              style={[
                styles.amountContainer,
                { transform: [{ scale: amountScale }] },
              ]}
            >
              <Text style={[styles.amountText, { color: accentColor }]}>
                {amountNumber.toLocaleString('ko-KR')}
                <Text style={styles.amountSuffix}>원</Text>
              </Text>
              <View style={styles.amountHint}>
                <Icon name={showNumPad ? 'chevron-up' : 'keypad-outline'} size={16} color={Colors.TextMuted} />
                <Text style={styles.amountHintText}>
                  {showNumPad ? '숫자패드 접기' : '탭하여 금액 입력'}
                </Text>
              </View>
            </Animated.View>
          </TouchableOpacity>

          {/* ─── Number Pad (토글) ─── */}
          {showNumPad && (
            <View style={styles.numPad}>
              {NUM_KEYS.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.numRow}>
                  {row.map((key) => (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.numKey,
                        key === '⌫' && styles.numKeyBackspace,
                      ]}
                      onPress={() => handleNumPress(key)}
                      activeOpacity={0.6}
                    >
                      {key === '⌫' ? (
                        <Icon name="backspace-outline" size={24} color={Colors.Text} />
                      ) : (
                        <Text style={styles.numKeyText}>{key}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* ─── 카테고리 선택 버튼 ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>카테고리</Text>
            <TouchableOpacity
              style={styles.categorySelectButton}
              onPress={() => setShowCategorySelectModal(true)}
              activeOpacity={0.7}
            >
              {selectedCategory ? (
                <>
                  <View style={[styles.catSelectIcon, { backgroundColor: selectedCategory.color + '18' }]}>
                    <CategoryIcon
                      icon={selectedCategory.icon}
                      categoryName={selectedCategory.name}
                      size={22}
                      color={selectedCategory.color}
                    />
                  </View>
                  <Text style={styles.catSelectText}>{formatCategoryLabel(selectedCategory.name, selectedCategory.group)}</Text>
                </>
              ) : (
                <>
                  <View style={[styles.catSelectIcon, { backgroundColor: Colors.CardBorder }]}>
                    <Icon name="grid-outline" size={22} color={Colors.TextMuted} />
                  </View>
                  <Text style={[styles.catSelectText, { color: Colors.TextMuted }]}>카테고리를 선택해주세요</Text>
                </>
              )}
              <Icon name="chevron-forward" size={18} color={Colors.TextMuted} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addCategoryLink}
              onPress={() => {
                navigation.goBack();
                // Tab의 Settings로 이동 (RootStack modal에서는 직접 접근 불가)
                setTimeout(() => {
                  navigation.navigate('MainTabs', { screen: 'Settings' });
                }, 100);
              }}
              activeOpacity={0.7}
            >
              <Icon name="add-circle-outline" size={16} color={Colors.Primary} />
              <Text style={styles.addCategoryLinkText}>새 카테고리 추가</Text>
            </TouchableOpacity>
          </View>

          {/* ─── Description ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>내역</Text>
            <View style={styles.inputContainer}>
              <Icon name="create-outline" size={20} color={Colors.TextSecondary} style={styles.inputFieldIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="거래 내역을 입력하세요"
                placeholderTextColor={Colors.TextMuted}
                value={description}
                onChangeText={setDescription}
                onFocus={(e) => {
                  e.target.measureLayout(
                    scrollViewRef.current?.getInnerViewNode(),
                    (_x: number, y: number) => {
                      setTimeout(() => scrollViewRef.current?.scrollTo({ y: y - 100, animated: true }), 200);
                    },
                    () => {},
                  );
                }}
              />
            </View>
          </View>

          {/* ─── Date Picker ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>날짜 및 시간</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={[styles.inputContainer, { flex: 1, paddingHorizontal: 12 }]}
                onPress={() => setShowDatePicker(true)}
              >
                <View style={[styles.dateLabelRow, { flex: 1 }]}>
                  <Icon name="calendar-outline" size={20} color={Colors.TextSecondary} style={styles.inputFieldIcon} />
                  <Text style={[styles.dateText, { fontSize: 13, flex: 1 }]} numberOfLines={1}>
                    {formatDateOnly(selectedDate)}
                  </Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.inputContainer, { flex: 0.8, paddingHorizontal: 12 }]}
                onPress={() => setShowTimePicker(true)}
              >
                <View style={[styles.dateLabelRow, { flex: 1 }]}>
                  <Icon name="time-outline" size={20} color={Colors.TextSecondary} style={styles.inputFieldIcon} />
                  <Text style={[styles.dateText, { fontSize: 13, flex: 1 }]} numberOfLines={1}>
                    {formatTimeOnly(selectedDate)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="spinner"
                onChange={(event: any, date?: Date) => {
                  setShowDatePicker(false);
                  if (event.type === 'set' && date) {
                    const newDate = new Date(selectedDate);
                    newDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                    setSelectedDate(newDate);
                  }
                }}
                locale="ko-KR"
                maximumDate={new Date()}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="time"
                display="spinner"
                onChange={(event: any, date?: Date) => {
                  setShowTimePicker(false);
                  if (event.type === 'set' && date) {
                    const newDate = new Date(selectedDate);
                    newDate.setHours(date.getHours(), date.getMinutes());
                    setSelectedDate(newDate);
                  }
                }}
                locale="ko-KR"
              />
            )}
          </View>

          {/* ─── 공동 지출 Toggle ─── */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelRow}>
                <Icon name="people-outline" size={20} color={Colors.TextSecondary} style={styles.inputFieldIcon} />
                <View>
                  <Text style={styles.sectionLabelToggle}>공동 지출</Text>
                  <Text style={styles.switchSubLabel}>
                    공동 지출로 기록합니다
                  </Text>
                </View>
              </View>
              <Switch
                value={isCoupleAccount}
                onValueChange={setIsCoupleAccount}
                trackColor={{
                  false: Colors.CardBorder,
                  true: `${Colors.Primary}80`,
                }}
                thumbColor={isCoupleAccount ? Colors.Primary : Colors.TextMuted}
              />
            </View>
          </View>

          {/* ─── Memo ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>메모</Text>
            <View style={styles.inputContainer}>
              <Icon name="document-text-outline" size={20} color={Colors.TextSecondary} style={styles.memoFieldIcon} />
              <TextInput
                style={[styles.textInput, styles.memoInput]}
                placeholder="메모를 입력하세요"
                placeholderTextColor={Colors.TextMuted}
                value={memo}
                onChangeText={setMemo}
                onFocus={(e) => {
                  e.target.measureLayout(
                    scrollViewRef.current?.getInnerViewNode(),
                    (_x: number, y: number) => {
                      setTimeout(() => scrollViewRef.current?.scrollTo({ y: y - 100, animated: true }), 200);
                    },
                    () => {},
                  );
                }}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* ─── Save Button ─── */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: accentColor }, (amountNumber === 0 || !selectedCategory || isSaving) && {opacity: 0.5}]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={amountNumber === 0 || !selectedCategory || isSaving}
          >
            <Text style={styles.saveBtnText}>
              {isSaving ? '저장 중...' : isEditMode ? '수정 완료' : '등록하기'}
            </Text>
          </TouchableOpacity>

          {/* ─── Delete Button (수정 모드에서만) ─── */}
          {isEditMode && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              activeOpacity={0.7}
              disabled={isDeleting}
            >
              <Icon name="trash-outline" size={18} color="#FF3B30" style={{ marginRight: 6 }} />
              <Text style={styles.deleteBtnText}>
                {isDeleting ? '삭제 중...' : '이 거래 삭제'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── Add Category Modal ─── */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>카테고리 추가</Text>
            <Text style={styles.modalSubtitle}>
              {txType === 'expense' ? '지출' : '수입'} 카테고리를 추가합니다
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="카테고리 이름 입력"
              placeholderTextColor={Colors.TextMuted}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoFocus
              maxLength={10}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setNewCategoryName('');
                  setShowCategoryModal(false);
                }}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, isAddingCategory && { opacity: 0.5 }]}
                onPress={handleAddCategory}
                disabled={isAddingCategory}
              >
                <Text style={styles.modalConfirmText}>
                  {isAddingCategory ? '추가 중...' : '확인'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ─── Category Select Modal (공용 컴포넌트) ─── */}
      <CategorySelectModal
        visible={showCategorySelectModal}
        onClose={() => setShowCategorySelectModal(false)}
        onSelect={(cat: Category) => {
          setSelectedCategory(cat);
        }}
        categories={allCategories}
        selectedId={selectedCategory?.id}
        type={txType}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.Background,
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: 250, // 키보드 여백 더 넉넉하게 추가
  },

  // Type Toggle
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.lg,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  typeText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.TextMuted,
  },
  typeTextActive: {
    color: '#FFFFFF',
  },

  // Amount
  amountContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
  },
  amountText: {
    fontSize: 36,
    fontWeight: '800',
  },
  amountSuffix: {
    fontSize: 20,
    fontWeight: '400',
  },
  amountHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  amountHintText: {
    fontSize: 12,
    color: Colors.TextMuted,
  },

  // Number Pad
  numPad: {
    marginBottom: Spacing.lg,
  },
  numRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  numKey: {
    width: NUM_PAD_SIZE,
    height: 56,
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numKeyText: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.Text,
  },
  numKeyBackspace: {
    backgroundColor: Colors.Surface,
  },

  // Category
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.TextSecondary,
    marginBottom: Spacing.sm,
  },
  sectionLabelToggle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.Text,
  },
  categorySelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.Card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  catSelectIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catSelectText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.Text,
  },
  addCategoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingLeft: 4,
  },
  addCategoryLinkText: {
    fontSize: 13,
    color: Colors.Primary,
    fontWeight: '500',
  },
  categoryIcon: {
    marginBottom: Spacing.xs,
  },
  categoryIconAdd: {
    marginBottom: Spacing.xs + 2,
    marginTop: 2,
  },
  categoryName: {
    fontSize: 12,
    color: Colors.TextSecondary,
    fontWeight: '500',
  },

  // Inputs
  inputContainer: {
    backgroundColor: Colors.Card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputFieldIcon: {
    marginRight: Spacing.sm,
  },
  memoFieldIcon: {
    marginRight: Spacing.sm,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.Text,
    padding: 0,
  },
  memoInput: {
    minHeight: 72,
  },
  dateText: {
    fontSize: 15,
    color: Colors.Text,
  },
  chevron: {
    fontSize: 20,
    color: Colors.TextMuted,
  },

  // Switch
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.Card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  switchLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchSubLabel: {
    fontSize: 12,
    color: Colors.TextMuted,
    marginTop: 2,
  },

  // Save
  saveBtn: {
    paddingVertical: Spacing.md + 2,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  saveBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    backgroundColor: Colors.Card,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.TextSecondary,
    marginBottom: Spacing.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.Text,
    marginBottom: Spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: Colors.Surface,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: Colors.Primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default AddTransactionScreen;
