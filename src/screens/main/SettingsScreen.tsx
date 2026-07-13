/**
 * PairBudget 설정 화면
 * 프로필, 가계부 관리, 알림, 계정 설정
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Modal,
  TextInput,
  Platform,
  PermissionsAndroid,
  Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../../theme/colors';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { GlassCard } from '../../components/GlassCard';
import { useAlert } from '../../components/CustomAlert';
import { useAuth } from '../../contexts/AuthContext';
import { useHousehold } from '../../contexts/HouseholdContext';
import { saveCoupleAccountBanks, checkNotificationPermission, requestNotificationPermission } from '../../services/NotificationService';
import { checkForUpdate, CURRENT_VERSION_NAME } from '../../services/UpdateService';
import { DraggableList } from '../../components/DraggableList';
import firestore from '@react-native-firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SettingsRowProps {
  icon: string; // Ionicons name
  title: string;
  subtitle?: string;
  value?: string;
  badge?: { text: string; color: string };
  showArrow?: boolean;
  danger?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
}

// ─── Settings Row Component ──────────────────────────────────────────────────

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  title,
  subtitle,
  value,
  badge,
  showArrow = true,
  danger = false,
  onPress,
  trailing,
}) => (
  <TouchableOpacity
    style={styles.settingsRow}
    onPress={onPress}
    activeOpacity={onPress ? 0.6 : 1}
    disabled={!onPress}
  >
    <View style={styles.rowLeft}>
      <Icon 
        name={icon} 
        size={22} 
        color={danger ? Colors.Danger : Colors.TextSecondary} 
        style={styles.rowIcon} 
      />
      <View style={styles.rowTextContainer}>
        <Text
          style={[styles.rowTitle, danger && { color: Colors.Danger }]}
        >
          {title}
        </Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
    </View>
    <View style={styles.rowRight}>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {badge && (
        <View
          style={[
            styles.badge,
            { backgroundColor: `${badge.color}20` },
          ]}
        >
          <Text style={[styles.badgeText, { color: badge.color }]}>
            {badge.text}
          </Text>
        </View>
      )}
      {trailing}
      {showArrow && onPress && (
        <Icon name="chevron-forward" size={16} color={Colors.TextMuted} style={styles.rowArrow} />
      )}
    </View>
  </TouchableOpacity>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip the @pairbudget.com suffix from emails for display */
const formatEmail = (email: string): string => {
  return email.replace(/@pairbudget\.com$/i, '');
};

/** Preset avatar emojis */
const PRESET_AVATARS = [
  { id: 'boy', emoji: '👦', label: '남자아이' },
  { id: 'girl', emoji: '👧', label: '여자아이' },
  { id: 'man', emoji: '👨', label: '남자' },
  { id: 'woman', emoji: '👩', label: '여자' },
  { id: 'cat', emoji: '🐱', label: '고양이' },
  { id: 'dog', emoji: '🐶', label: '강아지' },
  { id: 'bear', emoji: '🐻', label: '곰' },
  { id: 'fox', emoji: '🦊', label: '여우' },
  { id: 'rabbit', emoji: '🐰', label: '토끼' },
  { id: 'panda', emoji: '🐼', label: '판다' },
  { id: 'frog', emoji: '🐸', label: '개구리' },
  { id: 'penguin', emoji: '🐧', label: '펭귄' },
];

/** 지원 은행 목록 */
const SUPPORTED_BANKS = [
  { packageName: 'com.kbstar.kbank', name: 'KB국민', color: '#FFB300', initial: 'KB' },
  { packageName: 'com.shinhan.sbanking', name: '신한', color: '#0046FF', initial: '신한' },
  { packageName: 'com.wooribank.pib.smart', name: '우리', color: '#0066B3', initial: '우리' },
  { packageName: 'com.hanabank.ebk.channel.android.hananbank', name: '하나', color: '#009B8D', initial: '하나' },
  { packageName: 'com.nonghyup.banking', name: 'NH농협', color: '#00A651', initial: 'NH' },
  { packageName: 'com.kakaobank.channel', name: '카카오뱅크', color: '#FFEB00', initial: '카뱅' },
  { packageName: 'viva.republica.toss', name: '토스', color: '#0064FF', initial: '토스' },
  { packageName: 'com.ibk.neobanking', name: 'IBK기업', color: '#004B8D', initial: 'IBK' },
  { packageName: 'com.scbank.ma30', name: 'SC제일', color: '#0072AA', initial: 'SC' },
  { packageName: 'com.kdb.staron', name: 'KDB산업', color: '#003478', initial: 'KDB' },
  { packageName: 'com.su.banking', name: '수협', color: '#005BAC', initial: '수협' },
  { packageName: 'com.dgb.smart', name: 'DGB대구', color: '#007BC0', initial: 'DGB' },
  { packageName: 'com.bnk.bfg', name: 'BNK부산', color: '#ED1C24', initial: 'BNK' },
  { packageName: 'com.knb.psb', name: '경남', color: '#D2232A', initial: '경남' },
  { packageName: 'com.jeonbukbank.jb', name: 'JB전북', color: '#00954E', initial: 'JB' },
  { packageName: 'com.kjbank.goldwing', name: '광주', color: '#0072BC', initial: '광주' },
  { packageName: 'com.shinhancard.smartshinhan', name: '신한카드', color: '#0046FF', initial: '신카' },
  { packageName: 'com.lotte.lottemembers', name: '롯데카드', color: '#ED1C24', initial: '롯데' },
  { packageName: 'com.hyundaicard.appcard', name: '현대카드', color: '#000000', initial: '현카' },
  { packageName: 'com.samsungcard.mpocket', name: '삼성카드', color: '#0C4DA2', initial: '삼카' },
];

/** Get avatar emoji or first character of displayName */
const getAvatarDisplay = (photoURL?: string, displayName?: string): string => {
  if (photoURL) {
    const preset = PRESET_AVATARS.find(a => a.id === photoURL);
    if (preset) return preset.emoji;
  }
  return displayName ? displayName.charAt(0) : '?';
};

// ─── Settings Screen ─────────────────────────────────────────────────────────

const SettingsScreen: React.FC = () => {
  const { user, logout, updateUserProfile, linkWithGoogle, isGoogleLinked } = useAuth();
  const { household, categories, updateHouseholdName, addCategory, updateCategory, batchUpdateCategories, deleteCategory, resetCategories, resetTransactions, setCoupleAccountBanks, leaveHousehold, getMemberProfiles } = useHousehold();
  const { showAlert } = useAlert();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [listenerEnabled, setListenerEnabled] = useState(false);

  // ─── 모달 상태 ─────────────────────────────────────────────────────────
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.photoURL || '');

  const [householdModalVisible, setHouseholdModalVisible] = useState(false);
  const [householdNameInput, setHouseholdNameInput] = useState('');

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryModalKey, setCategoryModalKey] = useState(0);
  const [addCategoryModalVisible, setAddCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'expense' | 'income'>('expense');
  const [categoryViewType, setCategoryViewType] = useState<'expense' | 'income'>('expense');
  const [activeCategoryGroup, setActiveCategoryGroup] = useState<string>('');
  const [newCategoryGroup, setNewCategoryGroup] = useState<string>('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showCustomGroupInput, setShowCustomGroupInput] = useState(false);

  const [coupleBankModalVisible, setCoupleBankModalVisible] = useState(false);
  const [selectedBanks, setSelectedBanks] = useState<string[]>(household?.coupleAccountBanks || []);

  const [memberProfiles, setMemberProfiles] = useState<{uid: string; displayName: string; photoURL?: string}[]>([]);

  // ─── 파생 값 ───────────────────────────────────────────────────────────
  const displayName = user?.displayName || '사용자';
  const email = user?.email ? formatEmail(user.email) : '';
  const avatarText = getAvatarDisplay(user?.photoURL, displayName);

  const householdName = household?.name || '';
  const inviteCode = household?.inviteCode || '';
  const memberCount = household?.members?.length ?? 0;
  const coupleBankCount = household?.coupleAccountBanks?.length || 0;

  // ─── 멤버 프로필 로드 ────────────────────────────────────────────────────────
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const profiles = await getMemberProfiles();
        setMemberProfiles(profiles);
      } catch (e) {
        console.log('Failed to load member profiles:', e);
      }
    };
    if (household?.members?.length) loadMembers();
  }, [household?.members]);

  // ─── 알림 권한 체크 ────────────────────────────────────────────────────
  useEffect(() => {
    const checkPostNotification = async () => {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          try {
            const granted = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            );
            setNotificationsEnabled(granted);
          } catch {
            setNotificationsEnabled(false);
          }
        } else {
          setNotificationsEnabled(true);
        }
      }
    };
    checkPostNotification();
  }, []);

  // ─── 알림 접근(Listener) 상태 체크 ────────────────────────────────────
  const checkListenerStatus = async () => {
    try {
      const status = await checkNotificationPermission();
      setListenerEnabled(status === 'authorized');
    } catch {
      setListenerEnabled(false);
    }
  };

  useEffect(() => {
    checkListenerStatus();
  }, []);

  // ─── 핸들러 ────────────────────────────────────────────────────────────

  const handleLogout = () => {
    showAlert({
      title: '로그아웃',
      message: '정말 로그아웃 하시겠습니까?',
      icon: 'confirm',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              console.error('로그아웃 실패:', error);
            }
          },
        },
      ],
    });
  };

  const handleCopyInviteCode = async () => {
    if (inviteCode) {
      try {
        const { Clipboard } = require('react-native');
        if (Clipboard?.setString) {
          Clipboard.setString(inviteCode);
        }
      } catch (e) {
        // Clipboard not available
      }
      showAlert({ title: '복사 완료', message: `초대 코드: ${inviteCode}\n클립보드에 복사되었습니다!`, icon: 'success' });
    }
  };

  const handleOpenNotificationSettings = () => {
    requestNotificationPermission();
    // 설정에서 돌아왔을 때 상태 재확인 (3초 후)
    setTimeout(() => checkListenerStatus(), 3000);
  };

  const handleRequestPostNotification = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          setNotificationsEnabled(true);
          showAlert({ title: '완료', message: '알림이 허용되었습니다!', icon: 'success' });
        } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          // 사용자가 "다시 묻지 않기"를 선택한 경우 → 앱 설정으로 안내
          showAlert({
            title: '알림 권한 필요',
            message: '거래 감지 알림을 받으려면 앱 설정에서 알림을 허용해주세요.',
            icon: 'warning',
            buttons: [
              { text: '취소', style: 'cancel' },
              {
                text: '설정 열기',
                onPress: () => {
                  const { Linking } = require('react-native');
                  Linking.openSettings();
                },
              },
            ],
          });
        }
      } catch {
        showAlert({ title: '오류', message: '알림 권한 요청에 실패했습니다.', icon: 'error' });
      }
    }
  };

  // 프로필 편집
  const handleOpenProfileModal = () => {
    setProfileNameInput(displayName);
    setSelectedAvatar(user?.photoURL || '');
    setProfileModalVisible(true);
  };

  const handleSaveProfile = async () => {
    const trimmed = profileNameInput.trim();
    if (!trimmed) {
      showAlert({ title: '오류', message: '닉네임을 입력해주세요.', icon: 'error' });
      return;
    }
    try {
      await updateUserProfile({ displayName: trimmed, photoURL: selectedAvatar });
    } catch (error: any) {
      console.error('프로필 업데이트 실패:', error?.message || error);
      showAlert({ title: '오류', message: '프로필 변경에 실패했습니다.', icon: 'error' });
      return;
    }

    // 과거 거래의 createdByName도 일괄 업데이트
    if (user?.householdId && user?.uid) {
      try {
        const txSnap = await firestore()
          .collection('households')
          .doc(user.householdId)
          .collection('transactions')
          .where('createdBy', '==', user.uid)
          .get();

        if (!txSnap.empty) {
          // Firestore batch 제한: 500건씩 나누어 처리
          const BATCH_LIMIT = 500;
          const docs = txSnap.docs;
          for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
            const chunk = docs.slice(i, i + BATCH_LIMIT);
            const batch = firestore().batch();
            chunk.forEach(doc => {
              batch.update(doc.ref, { createdByName: trimmed });
            });
            await batch.commit();
          }
          console.log(`과거 거래 ${docs.length}건 이름 업데이트 완료`);
        }
      } catch (error: any) {
        console.error('과거 거래 이름 업데이트 실패:', error?.code, error?.message || error);
        showAlert({
          title: '일부 오류',
          message: `프로필은 변경되었지만, 과거 거래 내역의 이름 업데이트에 실패했습니다.\n(${error?.code || '알 수 없는 오류'})`,
          icon: 'warning',
        });
        setProfileModalVisible(false);
        return;
      }
    }

    setProfileModalVisible(false);
    showAlert({ title: '완료', message: '프로필이 변경되었습니다.', icon: 'success' });
  };

  // 가계부 이름 변경
  const handleOpenHouseholdModal = () => {
    setHouseholdNameInput(householdName);
    setHouseholdModalVisible(true);
  };

  const handleSaveHouseholdName = async () => {
    const trimmed = householdNameInput.trim();
    if (!trimmed) {
      showAlert({ title: '오류', message: '가계부 이름을 입력해주세요.', icon: 'error' });
      return;
    }
    try {
      await updateHouseholdName(trimmed);
      setHouseholdModalVisible(false);
      showAlert({ title: '완료', message: '가계부 이름이 변경되었습니다.', icon: 'success' });
    } catch (error) {
      console.error('가계부 이름 변경 실패:', error);
      showAlert({ title: '오류', message: '가계부 이름 변경에 실패했습니다.', icon: 'error' });
    }
  };

  // 카테고리 관리
  const handleOpenCategoryModal = () => {
    setCategoryModalKey(k => k + 1);
    setCategoryModalVisible(true);
  };

  const handleDeleteCategory = (categoryId: string, categoryName: string) => {
    showAlert({
      title: '카테고리 삭제',
      message: `"${categoryName}" 카테고리를 삭제하시겠습니까?`,
      icon: 'delete',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(categoryId);
            } catch (error) {
              console.error('카테고리 삭제 실패:', error);
              showAlert({ title: '오류', message: '카테고리 삭제에 실패했습니다.', icon: 'error' });
            }
          },
        },
      ],
    });
  };

  const handleResetCategories = () => {
    showAlert({
      title: '카테고리 초기화',
      message: '모든 카테고리를 삭제하고 기본 카테고리(대메뉴/소메뉴 구조)로 재설정합니다.\n\n기존 거래 내역의 카테고리는 유지됩니다.',
      icon: 'warning',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetCategories();
              // 진단: Firestore에서 직접 읽어서 확인
              const diagSnap = await firestore()
                .collection('households')
                .doc(user?.householdId || '')
                .collection('categories')
                .where('type', '==', 'income')
                .get();
              const diagGroups = [...new Set(diagSnap.docs.map(d => d.data().group || d.data().name))];
              showAlert({
                title: '완료',
                message: `카테고리 초기화 완료\n\n[진단] Firestore 수입: ${diagSnap.docs.length}개\n수입 대메뉴: ${diagGroups.join(', ')}`,
                icon: 'success',
              });
            } catch (error) {
              showAlert({ title: '오류', message: '카테고리 초기화에 실패했습니다.', icon: 'error' });
            }
          },
        },
      ],
    });
  };

  const handleOpenAddCategoryModal = () => {
    setNewCategoryName('');
    setNewCategoryType('expense');
    setNewCategoryGroup(activeCategoryGroup || '');
    setShowGroupPicker(false);
    setShowCustomGroupInput(false);
    setAddCategoryModalVisible(true);
  };

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      showAlert({ title: '오류', message: '카테고리 이름을 입력해주세요.', icon: 'error' });
      return;
    }
    try {
      await addCategory({
        name: trimmed,
        group: newCategoryGroup.trim() || '기타',
        icon: newCategoryType === 'expense' ? 'cash-outline' : 'wallet-outline',
        color: newCategoryType === 'expense' ? '#636E72' : '#74B9FF',
        type: newCategoryType,
        order: categories.filter(c => c.type === newCategoryType).length,
        isDefault: false,
      });
      setAddCategoryModalVisible(false);
      showAlert({ title: '완료', message: '카테고리가 추가되었습니다.', icon: 'success' });
    } catch (error) {
      console.error('카테고리 추가 실패:', error);
      showAlert({ title: '오류', message: '카테고리 추가에 실패했습니다.', icon: 'error' });
    }
  };

  // 카테고리 순서 변경 (소메뉴 - 같은 그룹 내 아이템)
  const handleReorderCategory = async (categoryId: string, direction: 'up' | 'down') => {
    const filtered = categories.filter(c => c.type === categoryViewType);
    const groupMap = new Map<string, typeof filtered>();
    filtered.forEach(cat => {
      const group = (cat as any).group || cat.name;
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(cat);
    });
    const effectiveGroup = activeCategoryGroup || (Array.from(groupMap.keys())[0] || '');
    const groupCats = (groupMap.get(effectiveGroup) || []).sort((a, b) => a.order - b.order);
    const currentIndex = groupCats.findIndex(c => c.id === categoryId);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= groupCats.length) return;

    const currentCat = groupCats[currentIndex];
    const targetCat = groupCats[targetIndex];

    try {
      await updateCategory(currentCat.id, { order: targetCat.order });
      await updateCategory(targetCat.id, { order: currentCat.order });
    } catch (error) {
      console.error('카테고리 순서 변경 실패:', error);
      showAlert({ title: '오류', message: '순서 변경에 실패했습니다.', icon: 'error' });
    }
  };

  // 대메뉴(그룹) 순서 변경 - 그룹 내 모든 카테고리의 order를 일괄 변경
  const handleReorderGroup = async (groupName: string, direction: 'up' | 'down') => {
    const filtered = categories.filter(c => c.type === categoryViewType);
    const groupMap = new Map<string, typeof filtered>();
    filtered.forEach(cat => {
      const group = (cat as any).group || cat.name;
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(cat);
    });
    const groups = Array.from(groupMap.keys());
    const currentIndex = groups.indexOf(groupName);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= groups.length) return;

    const currentGroupCats = groupMap.get(groups[currentIndex]) || [];
    const targetGroupCats = groupMap.get(groups[targetIndex]) || [];

    // 현재 그룹의 order 범위와 타겟 그룹의 order 범위를 스왑
    const currentOrders = currentGroupCats.map(c => c.order).sort((a, b) => a - b);
    const targetOrders = targetGroupCats.map(c => c.order).sort((a, b) => a - b);

    // 타겟 그룹의 시작 order부터 현재 그룹 아이템들을 재배치
    const baseOrderForCurrent = targetOrders[0];
    const baseOrderForTarget = direction === 'up'
      ? baseOrderForCurrent + currentGroupCats.length
      : currentOrders[0];
    const baseOrderForCurrentAdjusted = direction === 'up'
      ? targetOrders[0]
      : currentOrders[0] + targetGroupCats.length;

    try {
      const sortedCurrentCats = [...currentGroupCats].sort((a, b) => a.order - b.order);
      const sortedTargetCats = [...targetGroupCats].sort((a, b) => a.order - b.order);

      // 현재 그룹 아이템들에 새 order 부여
      for (let i = 0; i < sortedCurrentCats.length; i++) {
        await updateCategory(sortedCurrentCats[i].id, { order: baseOrderForCurrentAdjusted + i });
      }
      // 타겟 그룹 아이템들에 새 order 부여
      for (let i = 0; i < sortedTargetCats.length; i++) {
        await updateCategory(sortedTargetCats[i].id, { order: baseOrderForTarget + i });
      }
    } catch (error) {
      console.error('그룹 순서 변경 실패:', error);
      showAlert({ title: '오류', message: '그룹 순서 변경에 실패했습니다.', icon: 'error' });
    }
  };

  // 공동 통장 은행
  const handleOpenCoupleBankModal = () => {
    setSelectedBanks(household?.coupleAccountBanks || []);
    setCoupleBankModalVisible(true);
  };

  const handleToggleBank = (packageName: string) => {
    setSelectedBanks(prev =>
      prev.includes(packageName)
        ? prev.filter(p => p !== packageName)
        : [...prev, packageName],
    );
  };

  const handleSaveCoupleBanks = async () => {
    try {
      await setCoupleAccountBanks(selectedBanks);
      await saveCoupleAccountBanks(selectedBanks); // AsyncStorage 캐싱 (headless task용)
      setCoupleBankModalVisible(false);
      showAlert({ title: '완료', message: '공동 통장 은행이 저장되었습니다.', icon: 'success' });
    } catch (error) {
      console.error('공동 통장 은행 저장 실패:', error);
      showAlert({ title: '오류', message: '공동 통장 은행 저장에 실패했습니다.', icon: 'error' });
    }
  };

  // ─── 모달 렌더 ─────────────────────────────────────────────────────────

  const renderProfileModal = () => (
    <Modal
      visible={profileModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setProfileModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { maxHeight: '85%' }]}>
          <Text style={styles.modalTitle}>프로필 편집</Text>

          {/* 아바타 선택 */}
          <Text style={styles.avatarSectionTitle}>아바타 선택</Text>
          <View style={styles.avatarGrid}>
            {PRESET_AVATARS.map(avatar => (
              <TouchableOpacity
                key={avatar.id}
                style={[
                  styles.avatarOption,
                  selectedAvatar === avatar.id && styles.avatarOptionSelected,
                ]}
                onPress={() => setSelectedAvatar(avatar.id)}
              >
                <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 닉네임 입력 */}
          <Text style={styles.avatarSectionTitle}>닉네임</Text>
          <TextInput
            style={styles.modalInput}
            value={profileNameInput}
            onChangeText={setProfileNameInput}
            placeholder="닉네임을 입력하세요"
            placeholderTextColor={Colors.TextMuted}
            maxLength={20}
          />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setProfileModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={handleSaveProfile}
            >
              <Text style={styles.modalConfirmText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderHouseholdModal = () => (
    <Modal
      visible={householdModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setHouseholdModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>가계부 이름 변경</Text>
          <TextInput
            style={styles.modalInput}
            value={householdNameInput}
            onChangeText={setHouseholdNameInput}
            placeholder="새 가계부 이름을 입력하세요"
            placeholderTextColor={Colors.TextMuted}
            autoFocus
            maxLength={30}
          />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setHouseholdModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={handleSaveHouseholdName}
            >
              <Text style={styles.modalConfirmText}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderCategoryModal = () => {
    const filtered = categories.filter(c => c.type === categoryViewType);
    const groupMap = new Map<string, typeof filtered>();
    filtered.forEach(cat => {
      const group = (cat as any).group || cat.name;
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(cat);
    });
    const groups = Array.from(groupMap.keys());
    const effectiveGroup = activeCategoryGroup || (groups.length > 0 ? groups[0] : '');
    const activeCats = groupMap.get(effectiveGroup) || [];

    return (
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, styles.categoryModalContainer]}>
            <View style={styles.categoryModalHeader}>
              <Text style={styles.modalTitle}>카테고리 관리</Text>
              <TouchableOpacity
                onPress={() => setCategoryModalVisible(false)}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ padding: 8, marginRight: -8, marginTop: -8 }}
              >
                <Icon name="close" size={24} color={Colors.TextSecondary} />
              </TouchableOpacity>
            </View>

            {/* 지출/수입 토글 */}
            <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.Surface, borderRadius: 8, padding: 3 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', backgroundColor: categoryViewType === 'expense' ? Colors.Primary : 'transparent' }}
                onPress={() => { setCategoryViewType('expense'); setActiveCategoryGroup(''); }}
              >
                <Text style={{ fontWeight: '700', color: categoryViewType === 'expense' ? '#FFF' : Colors.TextMuted }}>지출</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', backgroundColor: categoryViewType === 'income' ? Colors.Primary : 'transparent' }}
                onPress={() => { setCategoryViewType('income'); setActiveCategoryGroup(''); }}
              >
                <Text style={{ fontWeight: '700', color: categoryViewType === 'income' ? '#FFF' : Colors.TextMuted }}>수입</Text>
              </TouchableOpacity>
            </View>

            {/* 좌/우 분할 */}
            <View style={{ flex: 1, flexDirection: 'row' }}>
              {/* 좌: 대메뉴 (드래그 앤 드롭) */}
              <View style={{ flexBasis: 105, flexGrow: 0, flexShrink: 0, backgroundColor: Colors.Surface, borderRightWidth: 1, borderRightColor: Colors.Divider }}>
                <DraggableList
                  key={`groups-${categoryModalKey}`}
                  data={groups}
                  keyExtractor={(g) => g}
                  onItemPress={(group) => setActiveCategoryGroup(group)}
                  itemHeight={52}
                  onReorder={async (reordered) => {
                    try {
                      const filtered = categories.filter(c => c.type === categoryViewType);
                      const groupMap = new Map<string, typeof filtered>();
                      filtered.forEach(cat => {
                        const g = (cat as any).group || cat.name;
                        if (!groupMap.has(g)) groupMap.set(g, []);
                        groupMap.get(g)!.push(cat);
                      });
                      const updates: { id: string; data: { order: number } }[] = [];
                      let orderCounter = 0;
                      for (const grp of reordered) {
                        const cats = (groupMap.get(grp) || []).sort((a, b) => a.order - b.order);
                        for (const cat of cats) {
                          if (cat.order !== orderCounter) {
                            updates.push({ id: cat.id, data: { order: orderCounter } });
                          }
                          orderCounter++;
                        }
                      }
                      if (updates.length > 0) await batchUpdateCategories(updates);
                    } catch (error) {
                      console.error('그룹 순서 변경 실패:', error);
                    }
                  }}
                  renderItem={(group) => {
                    const isActive = effectiveGroup === group;
                    return (
                      <View
                        style={{
                          height: 52,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingHorizontal: 6,
                          backgroundColor: isActive ? Colors.Background : Colors.Surface,
                          borderLeftWidth: 3,
                          borderLeftColor: isActive ? Colors.Primary : 'transparent',
                          borderBottomWidth: 1,
                          borderBottomColor: Colors.Divider,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '500', color: isActive ? Colors.Text : Colors.TextMuted, textAlign: 'center' }} numberOfLines={2}>{group}</Text>
                      </View>
                    );
                  }}
                />
              </View>

              {/* 우: 소메뉴 (드래그 앤 드롭) */}
              <View style={{ flex: 1, backgroundColor: Colors.Background }}>
                <DraggableList
                  key={`cats-${categoryModalKey}-${effectiveGroup}`}
                  data={activeCats.sort((a, b) => a.order - b.order)}
                  keyExtractor={(cat) => cat.id}
                  itemHeight={52}
                  onReorder={async (reordered) => {
                    try {
                      const updates: { id: string; data: { order: number } }[] = [];
                      for (let i = 0; i < reordered.length; i++) {
                        if (reordered[i].order !== i) {
                          updates.push({ id: reordered[i].id, data: { order: i } });
                        }
                      }
                      if (updates.length > 0) await batchUpdateCategories(updates);
                    } catch (error) {
                      console.error('카테고리 순서 변경 실패:', error);
                    }
                  }}
                  renderItem={(cat) => (
                    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: Colors.Divider, backgroundColor: Colors.Background }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: cat.color + '18', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                        <Icon name={cat.icon || 'cash-outline'} size={16} color={cat.color} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: Colors.Text }}>{cat.name}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteCategory(cat.id, cat.name)}
                        hitSlop={{ top: 12, bottom: 12, left: 16, right: 12 }}
                        style={{ padding: 12, marginRight: -8 }}
                      >
                        <Icon name="trash-outline" size={16} color={Colors.Danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                {activeCats.length === 0 && (
                  <Text style={{ textAlign: 'center', color: Colors.TextMuted, marginTop: 20 }}>카테고리가 없습니다</Text>
                )}
              </View>
            </View>

            {/* 하단 버튼 */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
              <TouchableOpacity
                style={styles.addCategoryBtn}
                onPress={handleOpenAddCategoryModal}
              >
                <Icon name="add-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.addCategoryBtnText}>카테고리 추가</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addCategoryBtn, { backgroundColor: Colors.Danger, marginTop: 8 }]}
                onPress={handleResetCategories}
              >
                <Icon name="refresh-outline" size={20} color="#FFFFFF" />
                <Text style={styles.addCategoryBtnText}>기본 카테고리로 초기화</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAddCategoryModal = () => (
    <Modal
      visible={addCategoryModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setAddCategoryModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>카테고리 추가</Text>

          {/* 타입 선택 */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeSelectorBtn, newCategoryType === 'expense' && styles.typeSelectorBtnActive]}
              onPress={() => { setNewCategoryType('expense'); setNewCategoryGroup(''); }}
            >
              <Text style={[styles.typeSelectorText, newCategoryType === 'expense' && styles.typeSelectorTextActive]}>지출</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeSelectorBtn, newCategoryType === 'income' && styles.typeSelectorBtnActive]}
              onPress={() => { setNewCategoryType('income'); setNewCategoryGroup(''); }}
            >
              <Text style={[styles.typeSelectorText, newCategoryType === 'income' && styles.typeSelectorTextActive]}>수입</Text>
            </TouchableOpacity>
          </View>

          {/* 대메뉴 선택 */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.TextSecondary, marginBottom: 6, marginTop: 4 }}>대메뉴 (그룹)</Text>
          <TouchableOpacity
            style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            onPress={() => setShowGroupPicker(!showGroupPicker)}
          >
            <Text style={{ color: newCategoryGroup ? Colors.Text : Colors.TextMuted }}>
              {newCategoryGroup || '대메뉴를 선택하세요'}
            </Text>
            <Icon name={showGroupPicker ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.TextMuted} />
          </TouchableOpacity>
          {showGroupPicker && (
            <ScrollView style={{ maxHeight: 140, borderWidth: 1, borderColor: Colors.CardBorder, borderRadius: 8, marginBottom: 8 }}>
              {Array.from(new Set(
                categories.filter(c => c.type === newCategoryType).map(c => (c as any).group || c.name)
              )).map(group => (
                <TouchableOpacity
                  key={group}
                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.Divider, backgroundColor: newCategoryGroup === group ? Colors.Primary + '10' : 'transparent' }}
                  onPress={() => { setNewCategoryGroup(group); setShowGroupPicker(false); }}
                >
                  <Text style={{ fontSize: 14, color: newCategoryGroup === group ? Colors.Primary : Colors.Text, fontWeight: newCategoryGroup === group ? '700' : '400' }}>{group}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: Colors.Surface }}
                onPress={() => { setNewCategoryGroup(''); setShowGroupPicker(false); setShowCustomGroupInput(true); }}
              >
                <Text style={{ fontSize: 14, color: Colors.Primary, fontWeight: '600' }}>+ 새 대메뉴 직접 입력</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
          {showCustomGroupInput && (
            <TextInput
              style={[styles.modalInput, { marginBottom: 8 }]}
              value={newCategoryGroup}
              onChangeText={setNewCategoryGroup}
              placeholder="새 대메뉴명 입력"
              placeholderTextColor={Colors.TextMuted}
              maxLength={10}
              autoFocus
            />
          )}

          {/* 소메뉴 이름 */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.TextSecondary, marginBottom: 6 }}>소메뉴 (카테고리명)</Text>
          <TextInput
            style={styles.modalInput}
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            placeholder="카테고리 이름을 입력하세요"
            placeholderTextColor={Colors.TextMuted}
            maxLength={20}
          />

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setAddCategoryModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={handleAddCategory}
            >
              <Text style={styles.modalConfirmText}>추가</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderCoupleBankModal = () => (
    <Modal
      visible={coupleBankModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setCoupleBankModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, styles.categoryModalContainer]}>
          <View style={styles.categoryModalHeader}>
            <Text style={styles.modalTitle}>공동 통장 은행 선택</Text>
            <TouchableOpacity onPress={() => setCoupleBankModalVisible(false)}>
              <Icon name="close" size={24} color={Colors.TextSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
            {SUPPORTED_BANKS.map(bank => {
              const isSelected = selectedBanks.includes(bank.packageName);
              return (
                <TouchableOpacity
                  key={bank.packageName}
                  style={styles.bankRow}
                  onPress={() => handleToggleBank(bank.packageName)}
                  activeOpacity={0.6}
                >
                  <View style={styles.categoryRowLeft}>
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: bank.color + '20',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 12,
                    }}>
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '800',
                        color: bank.color,
                      }}>{bank.initial}</Text>
                    </View>
                    <Text style={styles.categoryName}>{bank.name}</Text>
                  </View>
                  <Icon
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={isSelected ? Colors.Primary : Colors.TextMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setCoupleBankModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={handleSaveCoupleBanks}
            >
              <Text style={styles.modalConfirmText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ─── 메인 렌더 ─────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ─── Profile Section ─── */}
        <GlassCard style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{avatarText}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayName}</Text>
              <Text style={styles.profileEmail}>{email}</Text>
            </View>
            <TouchableOpacity style={styles.profileEditBtn} onPress={handleOpenProfileModal}>
              <Text style={styles.profileEditText}>편집</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* ─── 가계부 관리 ─── */}
        <Text style={styles.sectionHeader}>가계부 관리</Text>
        <GlassCard style={styles.sectionCard}>
          <SettingsRow
            icon="home-outline"
            title="가계부 이름"
            subtitle={householdName || '가계부를 생성해주세요'}
            value={memberCount > 0 ? `${memberCount}명` : undefined}
            badge={
              memberCount >= 2
                ? { text: '연결됨', color: Colors.Secondary }
                : undefined
            }
            onPress={handleOpenHouseholdModal}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="key-outline"
            title="초대 코드"
            subtitle="탭하여 복사 | 길게 눌러 공유"
            value={inviteCode || '없음'}
            onPress={inviteCode ? handleCopyInviteCode : undefined}
          />
          {inviteCode ? (
            <TouchableOpacity
              style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.sm, marginTop: 4}}
              onPress={async () => {
                try {
                  await Share.share({
                    message: `모두의 가계부에서 함께 가계부를 관리해요! 초대코드: ${inviteCode}`,
                  });
                } catch {}
              }}
            >
              <Icon name="share-social-outline" size={16} color={Colors.Primary} />
              <Text style={{marginLeft: 6, fontSize: 13, color: Colors.Primary, fontWeight: '600'}}>초대 코드 공유하기</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.separator} />
          <SettingsRow
            icon="grid-outline"
            title="카테고리 관리"
            subtitle="지출/수입 카테고리를 편집합니다"
            onPress={handleOpenCategoryModal}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="card-outline"
            title="공동 통장 은행"
            subtitle="등록한 은행 알림은 공동 지출로 자동 분류됩니다"
            value={coupleBankCount > 0 ? `${coupleBankCount}개` : '미등록'}
            onPress={handleOpenCoupleBankModal}
          />
        </GlassCard>

        {/* ─── 멤버 목록 ─── */}
        <Text style={styles.sectionHeader}>멤버</Text>
        <GlassCard style={styles.sectionCard}>
          {memberProfiles.length > 0 ? memberProfiles.map(member => (
            <View key={member.uid} style={{flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md}}>
              <View style={{width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.Primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm}}>
                <Text style={{fontSize: 16}}>{getAvatarDisplay(member.photoURL, member.displayName)}</Text>
              </View>
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={{fontSize: 15, fontWeight: '600', color: Colors.Text}}>{member.displayName}</Text>
                  {member.uid === user?.uid && (
                    <View style={{marginLeft: 6, backgroundColor: Colors.Primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1}}>
                      <Text style={{fontSize: 10, color: '#fff', fontWeight: '700'}}>나</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )) : (
            <View style={{paddingVertical: Spacing.md, alignItems: 'center'}}>
              <Text style={{color: Colors.TextMuted, fontSize: 14}}>멤버 정보를 불러오는 중...</Text>
            </View>
          )}
          <View style={styles.separator} />
          <TouchableOpacity
            style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.sm + 2}}
            onPress={() => {
              showAlert({
                title: '가계부 나가기',
                message: '정말 이 가계부를 나가시겠습니까? 내 데이터는 유지됩니다.',
                icon: 'warning',
                buttons: [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '나가기',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await leaveHousehold();
                        showAlert({ title: '완료', message: '가계부에서 나갔습니다.', icon: 'success' });
                      } catch (e: any) {
                        showAlert({ title: '오류', message: e.message || '나가기 실패', icon: 'error' });
                      }
                    },
                  },
                ],
              });
            }}
          >
            <Icon name="log-out-outline" size={16} color="#FF3B30" />
            <Text style={{marginLeft: 6, fontSize: 13, color: '#FF3B30', fontWeight: '600'}}>가계부 나가기</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 8}}
            onPress={() => {
              showAlert({
                title: '거래내역 초기화',
                message: '모든 거래내역, 승인 대기 내역, 월별 요약을 삭제합니다.\n\n이 작업은 되돌릴 수 없습니다.',
                icon: 'delete',
                buttons: [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await resetTransactions();
                        showAlert({ title: '완료', message: '모든 거래내역이 삭제되었습니다.', icon: 'success' });
                      } catch (error) {
                        showAlert({ title: '오류', message: '거래내역 삭제에 실패했습니다.', icon: 'error' });
                      }
                    },
                  },
                ],
              });
            }}
          >
            <Icon name="trash-outline" size={16} color="#FF9500" />
            <Text style={{marginLeft: 6, fontSize: 13, color: '#FF9500', fontWeight: '600'}}>거래내역 초기화</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* ─── 알림 설정 ─── */}
        <Text style={styles.sectionHeader}>알림 설정</Text>
        <GlassCard style={styles.sectionCard}>
          <SettingsRow
            icon="notifications-outline"
            title="알림 권한"
            subtitle={notificationsEnabled ? '탭하여 알림 설정을 변경합니다' : '거래 감지 시 푸시 알림을 받으려면 허용하세요'}
            onPress={notificationsEnabled
              ? () => Linking.openSettings()
              : handleRequestPostNotification
            }
            badge={
              notificationsEnabled
                ? { text: '허용됨', color: Colors.Secondary }
                : { text: '거부됨', color: Colors.Danger }
            }
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="eye-outline"
            title="알림 접근 허용"
            subtitle="은행/문자 알림을 자동으로 읽으려면 허용이 필요합니다"
            onPress={handleOpenNotificationSettings}
            badge={
              listenerEnabled
                ? { text: '허용됨', color: Colors.Secondary }
                : { text: '미허용', color: Colors.Danger }
            }
          />
        </GlassCard>

        {/* ─── 계정 ─── */}
        <Text style={styles.sectionHeader}>계정</Text>
        <GlassCard style={styles.sectionCard}>
          <SettingsRow
            icon="logo-google"
            title="Google 계정 연동"
            subtitle={isGoogleLinked ? 'Google 계정이 연동되어 있습니다' : 'Google 계정을 연동하면 다양한 방법으로 로그인할 수 있습니다'}
            badge={
              isGoogleLinked
                ? { text: '연동됨', color: Colors.Secondary }
                : undefined
            }
            onPress={isGoogleLinked ? undefined : async () => {
              try {
                await linkWithGoogle();
                showAlert({ title: '완료', message: 'Google 계정이 연동되었습니다.', icon: 'success' });
              } catch (e: any) {
                showAlert({ title: '오류', message: e.message || 'Google 연동 실패', icon: 'error' });
              }
            }}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="log-out-outline"
            title="로그아웃"
            danger
            showArrow={false}
            onPress={handleLogout}
          />
        </GlassCard>

        {/* ─── App Version ─── */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>모두의 가계부 v{CURRENT_VERSION_NAME}</Text>
          <Text style={styles.versionSubText}>공동 가계부의 시작</Text>
          <TouchableOpacity
            style={{
              marginTop: Spacing.sm,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: Colors.Primary + '15',
              borderWidth: 1,
              borderColor: Colors.Primary + '30',
            }}
            onPress={async () => {
              const update = await checkForUpdate();
              if (update) {
                const handleUpdate = () => {
                  Linking.openURL(update.downloadUrl);
                };

                showAlert({
                  title: '업데이트 알림 🎉',
                  message: `새 버전 v${update.latestVersionName}이 출시되었습니다!\n\n${update.releaseNotes || '최신 버전으로 업데이트 해주세요.'}`,
                  icon: 'info',
                  buttons: update.forceUpdate
                    ? [{ text: '업데이트', onPress: handleUpdate }]
                    : [
                        { text: '나중에', style: 'cancel' },
                        { text: '업데이트', onPress: handleUpdate },
                      ],
                });
              } else {
                showAlert({
                  title: '최신 버전',
                  message: '현재 최신 버전을 사용 중입니다 ✅',
                  icon: 'success',
                  buttons: [{ text: '확인' }],
                });
              }
            }}
          >
            <Text style={{ fontSize: 13, color: Colors.Primary, fontWeight: '600' }}>업데이트 확인</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {/* ─── 모달들 ─── */}
      {renderProfileModal()}
      {renderHouseholdModal()}
      {renderCategoryModal()}
      {renderAddCategoryModal()}
      {renderCoupleBankModal()}
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

  // Header
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: Spacing.lg,
  },

  // Profile
  profileCard: {
    marginBottom: Spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.Primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: Colors.TextMuted,
  },
  profileEditBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
  },
  profileEditText: {
    fontSize: 13,
    color: Colors.Primary,
    fontWeight: '600',
  },

  // Section
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  sectionCard: {
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },

  // Settings Row
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    marginRight: Spacing.md,
    width: 24,
    textAlign: 'center',
  },
  rowTextContainer: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.Text,
    marginBottom: 1,
  },
  rowSubtitle: {
    fontSize: 12,
    color: Colors.TextMuted,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowValue: {
    fontSize: 13,
    color: Colors.TextSecondary,
  },
  rowArrow: {
    marginLeft: 4,
  },

  // Badge
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Separator
  separator: {
    height: 1,
    backgroundColor: Colors.Divider,
    marginLeft: 40,
  },

  // Version
  versionContainer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  versionText: {
    fontSize: 13,
    color: Colors.TextMuted,
    marginBottom: Spacing.xs,
  },
  versionSubText: {
    fontSize: 12,
    color: Colors.TextMuted,
  },

  // ─── 모달 공통 스타일 ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: Colors.Surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
    marginBottom: Spacing.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.Text,
    backgroundColor: Colors.Background,
    marginBottom: Spacing.md,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  modalCancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.Background,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  modalConfirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.Primary,
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ─── 카테고리 모달 스타일 ──────────────────────────────────────────────
  categoryModalContainer: {
    height: '75%',
    padding: 0,
    paddingTop: 16,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  categoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: 16,
  },
  categoryList: {
    marginBottom: Spacing.md,
  },
  categorySectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    paddingLeft: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.Divider,
  },
  categoryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    marginRight: Spacing.sm,
    width: 24,
    textAlign: 'center',
  },
  categoryName: {
    fontSize: 15,
    color: Colors.Text,
    fontWeight: '500',
  },
  categoryDeleteBtn: {
    padding: Spacing.sm,
  },
  categoryEmpty: {
    fontSize: 13,
    color: Colors.TextMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  addCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.Primary,
    borderRadius: 10,
    paddingVertical: 12,
    gap: Spacing.sm,
  },
  addCategoryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ─── 타입 선택 스타일 ──────────────────────────────────────────────────
  typeSelector: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  typeSelectorBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    alignItems: 'center',
    backgroundColor: Colors.Background,
  },
  typeSelectorBtnActive: {
    borderColor: Colors.Primary,
    backgroundColor: `${Colors.Primary}15`,
  },
  typeSelectorText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.TextSecondary,
  },
  typeSelectorTextActive: {
    color: Colors.Primary,
  },

  // ─── 아바타 선택 스타일 ────────────────────────────────────────────────
  avatarSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TextMuted,
    marginBottom: Spacing.sm,
    paddingLeft: 2,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
    justifyContent: 'center',
  },
  avatarOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.Background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarOptionSelected: {
    borderColor: Colors.Primary,
    backgroundColor: `${Colors.Primary}15`,
  },
  avatarEmoji: {
    fontSize: 28,
  },

  // ─── 공동 통장 은행 모달 스타일 ─────────────────────────────────────────
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.Divider,
  },
});

export default SettingsScreen;
