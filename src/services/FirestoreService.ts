/**
 * FirestoreService.ts
 *
 * CRUD service for PairBudget backed by Cloud Firestore.
 *
 * Depends on:  @react-native-firebase/firestore
 * Install:     yarn add @react-native-firebase/app @react-native-firebase/firestore
 */

import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

import {
  User,
  Household,
  Transaction,
  Category,
  MonthlySummary,
  DEFAULT_CATEGORIES,
} from '../types';

// ---------------------------------------------------------------------------
// Collection references (helpers)
// ---------------------------------------------------------------------------

const usersCol = () => firestore().collection('users');
const householdsCol = () => firestore().collection('households');
const transactionsCol = (householdId: string) =>
  firestore()
    .collection('households')
    .doc(householdId)
    .collection('transactions');
const categoriesCol = (householdId: string) =>
  firestore()
    .collection('households')
    .doc(householdId)
    .collection('categories');
const summariesCol = (householdId: string) =>
  firestore()
    .collection('households')
    .doc(householdId)
    .collection('monthlySummaries');

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Invite code generator
// ---------------------------------------------------------------------------

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

/**
 * Generate a random 6-character alphanumeric invite code.
 */
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CHARS.charAt(Math.floor(Math.random() * INVITE_CHARS.length));
  }
  return code;
}

// ---------------------------------------------------------------------------
// User CRUD
// ---------------------------------------------------------------------------

export async function createUser(uid: string, data: Partial<User>): Promise<void> {
  const now = firestore.Timestamp.now().toDate();
  await usersCol().doc(uid).set({
    uid,
    displayName: data.displayName ?? '',
    email: data.email ?? '',
    householdId: data.householdId ?? null,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  });
}

export async function getUser(uid: string): Promise<User | null> {
  const snap = await usersCol().doc(uid).get();
  if (!snap.exists) return null;
  return docToUser(snap);
}

export async function updateUser(uid: string, data: Partial<User>): Promise<void> {
  await usersCol().doc(uid).update({
    ...data,
    updatedAt: firestore.Timestamp.now().toDate(),
  });
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------

/**
 * Create a new household, seed default categories, and link the creating user.
 * @returns The new household document ID.
 */
export async function createHousehold(
  userId: string,
  name: string,
): Promise<string> {
  const inviteCode = generateInviteCode();
  const now = firestore.Timestamp.now().toDate();

  const householdRef = householdsCol().doc(); // auto-ID
  const householdId = householdRef.id;

  const batch = firestore().batch();

  // 1. Household document
  batch.set(householdRef, {
    id: householdId,
    name,
    members: [userId],
    inviteCode,
    monthlyBudget: 0,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Default categories
  for (const cat of DEFAULT_CATEGORIES) {
    const catRef = categoriesCol(householdId).doc();
    batch.set(catRef, { ...cat, id: catRef.id });
  }

  // 3. Link user → household
  batch.update(usersCol().doc(userId), {
    householdId,
    updatedAt: now,
  });

  await batch.commit();
  return householdId;
}

/**
 * Join an existing household by invite code.
 * @returns The household document ID.
 * @throws  If no household with the given inviteCode exists.
 */
export async function joinHousehold(
  userId: string,
  inviteCode: string,
): Promise<string> {
  const snap = await householdsCol()
    .where('inviteCode', '==', inviteCode.toUpperCase())
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error('유효하지 않은 초대 코드입니다.');
  }

  const householdDoc = snap.docs[0];
  const householdId = householdDoc.id;
  const now = firestore.Timestamp.now().toDate();

  const batch = firestore().batch();

  batch.update(householdDoc.ref, {
    members: firestore.FieldValue.arrayUnion(userId),
    updatedAt: now,
  });

  batch.update(usersCol().doc(userId), {
    householdId,
    updatedAt: now,
  });

  await batch.commit();
  return householdId;
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  const snap = await householdsCol().doc(householdId).get();
  if (!snap.exists) return null;
  return docToHousehold(snap);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function addTransaction(
  householdId: string,
  transaction: Omit<Transaction, 'id'>,
): Promise<string> {
  const ref = transactionsCol(householdId).doc();
  await ref.set({ ...transaction, id: ref.id });
  return ref.id;
}

export async function updateTransaction(
  householdId: string,
  transactionId: string,
  data: Partial<Transaction>,
): Promise<void> {
  await transactionsCol(householdId).doc(transactionId).update({
    ...data,
    updatedAt: firestore.Timestamp.now().toDate(),
  });
}

export async function deleteTransaction(
  householdId: string,
  transactionId: string,
): Promise<void> {
  await transactionsCol(householdId).doc(transactionId).delete();
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getCategories(householdId: string): Promise<Category[]> {
  const snap = await categoriesCol(householdId).orderBy('order').get();
  return snap.docs.map((d) => d.data() as Category);
}

export async function addCategory(
  householdId: string,
  category: Omit<Category, 'id'>,
): Promise<string> {
  const ref = categoriesCol(householdId).doc();
  await ref.set({ ...category, id: ref.id });
  return ref.id;
}

// ---------------------------------------------------------------------------
// Monthly Summary
// ---------------------------------------------------------------------------

export async function getMonthlySummary(
  householdId: string,
  yearMonth: string,
): Promise<MonthlySummary | null> {
  const snap = await summariesCol(householdId).doc(yearMonth).get();
  if (!snap.exists) return null;
  return snap.data() as MonthlySummary;
}

/**
 * Incrementally update the monthly summary when a transaction is
 * added or deleted. Avoids recomputing from scratch.
 *
 * @param isDelete  If true, the transaction totals are subtracted.
 */
export async function updateMonthlySummary(
  householdId: string,
  yearMonth: string,
  transaction: Transaction,
  isDelete: boolean = false,
): Promise<void> {
  const ref = summariesCol(householdId).doc(yearMonth);
  const sign = isDelete ? -1 : 1;
  const amount = transaction.amount * sign;
  const now = firestore.Timestamp.now().toDate();

  const dateKey =
    transaction.date instanceof Date
      ? transaction.date.toISOString().slice(0, 10)
      : String(transaction.date).slice(0, 10);

  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists) {
      // First transaction of the month → create summary
      const summary: MonthlySummary = {
        householdId,
        yearMonth,
        totalIncome: transaction.type === 'income' ? amount : 0,
        totalExpense: transaction.type === 'expense' ? amount : 0,
        categoryBreakdown: {
          [transaction.categoryId]: {
            categoryName: transaction.categoryName,
            amount,
            count: isDelete ? 0 : 1,
            budget: 0,
          },
        },
        dailyTotals: { [dateKey]: amount },
        transactionCount: isDelete ? 0 : 1,
        updatedAt: now,
      };
      tx.set(ref, summary);
      return;
    }

    // Existing summary → incremental update
    const data = snap.data() as MonthlySummary;

    if (transaction.type === 'income') {
      data.totalIncome += amount;
    } else {
      data.totalExpense += amount;
    }

    // Category breakdown
    const catEntry = data.categoryBreakdown[transaction.categoryId] ?? {
      categoryName: transaction.categoryName,
      amount: 0,
      count: 0,
      budget: 0,
    };
    catEntry.amount += amount;
    catEntry.count += sign;
    data.categoryBreakdown[transaction.categoryId] = catEntry;

    // Daily totals
    data.dailyTotals[dateKey] = (data.dailyTotals[dateKey] ?? 0) + amount;

    data.transactionCount += sign;
    data.updatedAt = now;

    tx.set(ref, data);
  });
}

// ---------------------------------------------------------------------------
// Firestore document → typed object helpers
// ---------------------------------------------------------------------------

function docToUser(
  snap: FirebaseFirestoreTypes.DocumentSnapshot,
): User {
  const d = snap.data()!;
  return {
    uid: d.uid,
    displayName: d.displayName,
    email: d.email,
    householdId: d.householdId ?? null,
    createdAt: d.createdAt?.toDate?.() ?? new Date(d.createdAt),
    updatedAt: d.updatedAt?.toDate?.() ?? new Date(d.updatedAt),
  };
}

function docToHousehold(
  snap: FirebaseFirestoreTypes.DocumentSnapshot,
): Household {
  const d = snap.data()!;
  return {
    id: snap.id,
    name: d.name,
    members: d.members ?? [],
    inviteCode: d.inviteCode,
    coupleAccountBank: d.coupleAccountBank,
    currency: d.currency || 'KRW',
    monthlyBudget: d.monthlyBudget ?? 0,
    createdAt: d.createdAt?.toDate?.() ?? new Date(d.createdAt),
    updatedAt: d.updatedAt?.toDate?.() ?? new Date(d.updatedAt),
  };
}
