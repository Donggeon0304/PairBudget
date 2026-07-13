import React, {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import firestore from '@react-native-firebase/firestore';
import {useAuth} from './AuthContext';
import {Household, Category, DEFAULT_CATEGORIES} from '../types';
import {saveCoupleAccountBanks} from '../services/NotificationService';

interface MemberProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
}

interface HouseholdContextType {
  household: Household | null;
  categories: Category[];
  isLoading: boolean;
  hasHousehold: boolean;
  createHousehold: (name: string) => Promise<string>;
  joinHousehold: (inviteCode: string) => Promise<void>;
  leaveHousehold: () => Promise<void>;
  getMemberProfiles: () => Promise<MemberProfile[]>;
  regenerateInviteCode: () => Promise<string>;
  setCoupleAccountBank: (packageName: string) => Promise<void>;
  setCoupleAccountBanks: (packageNames: string[]) => Promise<void>;
  refreshCategories: () => Promise<void>;
  updateHouseholdName: (name: string) => Promise<void>;
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (categoryId: string, data: Partial<Category>) => Promise<void>;
  batchUpdateCategories: (updates: { id: string; data: Partial<Category> }[]) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  resetCategories: () => Promise<void>;
  resetTransactions: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

export const useHousehold = (): HouseholdContextType => {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHousehold must be used within a HouseholdProvider');
  }
  return context;
};

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

interface HouseholdProviderProps {
  children: ReactNode;
}

export const HouseholdProvider: React.FC<HouseholdProviderProps> = ({children}) => {
  const {user, updateUserProfile} = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Listen to household changes in real-time
  useEffect(() => {
    if (!user?.householdId) {
      setHousehold(null);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    const unsubscribe = firestore()
      .collection('households')
      .doc(user.householdId)
      .onSnapshot(
        (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            setHousehold({
              id: doc.id,
              name: data?.name || '',
              members: data?.members || [],
              inviteCode: data?.inviteCode || '',
              coupleAccountBank: data?.coupleAccountBank,
              coupleAccountBanks: data?.coupleAccountBanks || [],
              currency: data?.currency || 'KRW',
              createdAt: data?.createdAt?.toDate() || new Date(),
            });
            // AsyncStorage에 공동 은행 목록 동기화 (headless task용)
            if (data?.coupleAccountBanks && data.coupleAccountBanks.length > 0) {
              saveCoupleAccountBanks(data.coupleAccountBanks).catch(() => {});
            }
          }
          setIsLoading(false);
        },
        (error) => {
          console.error('Household listener error:', error);
          setIsLoading(false);
        },
      );

    return () => unsubscribe();
  }, [user?.householdId]);

  // Emoji to Ionicons migration map
  const ICON_MIGRATION: Record<string, string> = {
    '\u{1F37D}\u{FE0F}': 'restaurant-outline', // 🍽️
    '\u{2615}': 'cafe-outline',                // ☕
    '\u{1F697}': 'car-outline',                // 🚗
    '\u{1F6CD}\u{FE0F}': 'bag-outline',        // 🛍️
    '\u{1F3AC}': 'film-outline',               // 🎬
    '\u{1F3E0}': 'home-outline',               // 🏠
    '\u{1F48A}': 'medical-outline',            // 💊
    '\u{1F4DA}': 'book-outline',               // 📚
    '\u{1F3EA}': 'storefront-outline',         // 🏪
    '\u{1F4F1}': 'phone-portrait-outline',     // 📱
    '\u{1F4B8}': 'cash-outline',               // 💸
    '\u{1F4B0}': 'wallet-outline',             // 💰
    '\u{1F381}': 'gift-outline',               // 🎁
    '\u{1F4C8}': 'trending-up-outline',        // 📈
    '\u{1F35A}': 'restaurant-outline',         // 🍚
    '\u{1F3E5}': 'medical-outline',            // 🏥
    '\u{1F504}': 'refresh-outline',            // 🔄
    '\u{1F4E6}': 'cube-outline',               // 📦
  };

  const migrateIcon = (icon: string): string => {
    return ICON_MIGRATION[icon] || icon;
  };

  // Listen to categories
  useEffect(() => {
    if (!user?.householdId) return;

    const unsubscribe = firestore()
      .collection('households')
      .doc(user.householdId)
      .collection('categories')
      .orderBy('order')
      .onSnapshot(
        (snapshot) => {
          const cats: Category[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            icon: migrateIcon(doc.data().icon || 'cash-outline'),
          })) as Category[];
          setCategories(cats);

          // DEBUG: 수입 카테고리 group 확인
          const incomeCats = cats.filter(c => c.type === 'income');
          const incomeGroups = [...new Set(incomeCats.map(c => (c as any).group || c.name))];
          console.log(`[DEBUG] Income categories: ${incomeCats.length}개, groups: ${JSON.stringify(incomeGroups)}`);
          incomeCats.forEach(c => console.log(`  - ${c.name} (group: ${(c as any).group || 'NONE'})`));

          // Auto-migrate icons in Firestore (one-time)
          snapshot.docs.forEach((doc) => {
            const oldIcon = doc.data().icon;
            if (oldIcon && ICON_MIGRATION[oldIcon]) {
              doc.ref.update({ icon: ICON_MIGRATION[oldIcon] });
            }
          });

          // Auto-add missing default categories (e.g., 생활비)
          const existingKeys = new Set(cats.map(c => `${c.name}::${(c as any).group || ''}`));
          const missingCats = DEFAULT_CATEGORIES.filter(dc => !existingKeys.has(`${dc.name}::${(dc as any).group || ''}`));
          if (missingCats.length > 0 && user?.householdId) {
            const batch = firestore().batch();
            missingCats.forEach(mc => {
              const ref = firestore()
                .collection('households')
                .doc(user.householdId!)
                .collection('categories')
                .doc();
              batch.set(ref, { ...mc, id: ref.id });
            });
            batch.commit().catch(e => console.warn('[Category Migration]', e));
          }
        },
        (error) => {
          console.error('Categories listener error:', error);
        },
      );

    return () => unsubscribe();
  }, [user?.householdId]);

  const createHousehold = async (name: string): Promise<string> => {
    if (!user) throw new Error('로그인이 필요합니다');

    const inviteCode = generateInviteCode();

    // Create household document
    const householdRef = await firestore().collection('households').add({
      name,
      members: [user.uid],
      inviteCode,
      currency: 'KRW',
      createdAt: firestore.FieldValue.serverTimestamp(),
    });

    // Create default categories
    const batch = firestore().batch();
    DEFAULT_CATEGORIES.forEach((cat) => {
      const catRef = firestore()
        .collection('households')
        .doc(householdRef.id)
        .collection('categories')
        .doc();
      batch.set(catRef, cat);
    });
    await batch.commit();

    // Update user's householdId
    await updateUserProfile({householdId: householdRef.id});

    return inviteCode;
  };

  const joinHousehold = async (inviteCode: string): Promise<void> => {
    if (!user) throw new Error('로그인이 필요합니다');

    // Find household by invite code
    const snapshot = await firestore()
      .collection('households')
      .where('inviteCode', '==', inviteCode.toUpperCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error('유효하지 않은 초대 코드입니다');
    }

    const householdDoc = snapshot.docs[0];
    const householdData = householdDoc.data();

    if (householdData.members?.length >= 2) {
      throw new Error('이미 2명이 참여한 가계부입니다');
    }

    if (householdData.members?.includes(user.uid)) {
      throw new Error('이미 참여 중인 가계부입니다');
    }

    // Add user to household members
    await firestore()
      .collection('households')
      .doc(householdDoc.id)
      .update({
        members: firestore.FieldValue.arrayUnion(user.uid),
      });

    // Update user's householdId
    await updateUserProfile({householdId: householdDoc.id});
  };

  const setCoupleAccountBank = async (packageName: string): Promise<void> => {
    if (!user?.householdId) return;

    await firestore()
      .collection('households')
      .doc(user.householdId)
      .update({coupleAccountBank: packageName});
  };

  const setCoupleAccountBanks = async (packageNames: string[]): Promise<void> => {
    if (!user?.householdId) return;

    await firestore()
      .collection('households')
      .doc(user.householdId)
      .update({coupleAccountBanks: packageNames});
  };

  const refreshCategories = async (): Promise<void> => {
    if (!user?.householdId) return;

    const snapshot = await firestore()
      .collection('households')
      .doc(user.householdId)
      .collection('categories')
      .orderBy('order')
      .get();

    const cats: Category[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Category[];
    setCategories(cats);
  };

  const updateHouseholdName = async (name: string): Promise<void> => {
    if (!user?.householdId) return;

    await firestore()
      .collection('households')
      .doc(user.householdId)
      .update({name});
  };

  const addCategory = async (category: Omit<Category, 'id'>): Promise<void> => {
    if (!user?.householdId) return;

    await firestore()
      .collection('households')
      .doc(user.householdId)
      .collection('categories')
      .add({
        ...category,
        order: categories.length + 1,
      });
  };

  const updateCategory = async (categoryId: string, data: Partial<Category>): Promise<void> => {
    if (!user?.householdId) return;

    await firestore()
      .collection('households')
      .doc(user.householdId)
      .collection('categories')
      .doc(categoryId)
      .update(data);
  };

  const batchUpdateCategories = async (updates: { id: string; data: Partial<Category> }[]): Promise<void> => {
    if (!user?.householdId || updates.length === 0) return;
    const batch = firestore().batch();
    const catCol = firestore().collection('households').doc(user.householdId).collection('categories');
    for (const { id, data } of updates) {
      batch.update(catCol.doc(id), data);
    }
    await batch.commit();
  };

  const deleteCategory = async (categoryId: string): Promise<void> => {
    if (!user?.householdId) return;

    await firestore()
      .collection('households')
      .doc(user.householdId)
      .collection('categories')
      .doc(categoryId)
      .delete();
  };

  /** 기존 카테고리 전체 삭제 후 DEFAULT_CATEGORIES로 재생성 */
  const resetCategories = async (): Promise<void> => {
    if (!user?.householdId) return;

    const catCol = firestore()
      .collection('households')
      .doc(user.householdId)
      .collection('categories');

    // 기존 카테고리 삭제
    const existing = await catCol.get();
    console.log(`[RESET] 기존 카테고리 ${existing.docs.length}개 삭제 중...`);
    const deleteBatch = firestore().batch();
    existing.docs.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    console.log(`[RESET] 삭제 완료`);

    // 새 카테고리 생성
    const incomeCats = DEFAULT_CATEGORIES.filter(c => c.type === 'income');
    const incomeGroups = [...new Set(incomeCats.map(c => c.group || c.name))];
    console.log(`[RESET] DEFAULT_CATEGORIES 총 ${DEFAULT_CATEGORIES.length}개 (수입: ${incomeCats.length}개, 수입 그룹: ${JSON.stringify(incomeGroups)})`);

    const createBatch = firestore().batch();
    DEFAULT_CATEGORIES.forEach(cat => {
      const ref = catCol.doc();
      createBatch.set(ref, cat);
    });
    await createBatch.commit();
    console.log(`[RESET] ${DEFAULT_CATEGORIES.length}개 카테고리 생성 완료`);
  };

  /** 거래내역 + 월별요약 전체 삭제 */
  const resetTransactions = async (): Promise<void> => {
    if (!user?.householdId) return;
    const hId = user.householdId;

    // transactions 삭제
    const txSnap = await firestore().collection('households').doc(hId).collection('transactions').get();
    const batch1 = firestore().batch();
    txSnap.docs.forEach(doc => batch1.delete(doc.ref));
    await batch1.commit();

    // monthlySummaries 삭제
    const sumSnap = await firestore().collection('households').doc(hId).collection('monthlySummaries').get();
    const batch2 = firestore().batch();
    sumSnap.docs.forEach(doc => batch2.delete(doc.ref));
    await batch2.commit();

    // pendingTransactions 삭제
    const pendSnap = await firestore().collection('households').doc(hId).collection('pendingTransactions').get();
    const batch3 = firestore().batch();
    pendSnap.docs.forEach(doc => batch3.delete(doc.ref));
    await batch3.commit();
  };

  const leaveHousehold = async (): Promise<void> => {
    if (!user?.householdId || !user?.uid) throw new Error('가계부에 속해 있지 않습니다.');

    // Remove user from household members
    await firestore()
      .collection('households')
      .doc(user.householdId)
      .update({
        members: firestore.FieldValue.arrayRemove(user.uid),
      });

    // Clear user's householdId
    await updateUserProfile({householdId: ''});
  };

  const getMemberProfiles = async (): Promise<MemberProfile[]> => {
    if (!household?.members || household.members.length === 0) return [];

    const profiles: MemberProfile[] = [];
    for (const uid of household.members) {
      try {
        const userDoc = await firestore().collection('users').doc(uid).get();
        if (userDoc.exists()) {
          const data = userDoc.data();
          profiles.push({
            uid,
            displayName: data?.displayName || '알 수 없음',
            photoURL: data?.photoURL || '',
            email: data?.email || '',
          });
        } else {
          profiles.push({ uid, displayName: '탈퇴한 사용자' });
        }
      } catch {
        profiles.push({ uid, displayName: '알 수 없음' });
      }
    }
    return profiles;
  };

  const regenerateInviteCode = async (): Promise<string> => {
    if (!user?.householdId) throw new Error('가계부에 속해 있지 않습니다.');
    const newCode = generateInviteCode();
    await firestore()
      .collection('households')
      .doc(user.householdId)
      .update({ inviteCode: newCode });
    return newCode;
  };

  return (
    <HouseholdContext.Provider
      value={{
        household,
        categories,
        isLoading,
        hasHousehold: !!household,
        createHousehold,
        joinHousehold,
        leaveHousehold,
        getMemberProfiles,
        regenerateInviteCode,
        setCoupleAccountBank,
        setCoupleAccountBanks,
        refreshCategories,
        updateHouseholdName,
        addCategory,
        updateCategory,
        batchUpdateCategories,
        deleteCategory,
        resetCategories,
        resetTransactions,
      }}>
      {children}
    </HouseholdContext.Provider>
  );
};

export default HouseholdContext;
