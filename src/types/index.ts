/**
 * PairBudget 타입 정의
 * 공동 가계부 앱의 핵심 데이터 모델
 */

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  householdId?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Household {
  id: string;
  name: string;
  members: string[];
  inviteCode: string;
  coupleAccountBank?: string; // 공동통장 은행 패키지명 (레거시, 단일)
  coupleAccountBanks?: string[]; // 공동통장 은행 패키지명 목록
  currency: string;
  createdAt: Date;
  updatedAt?: Date;
  monthlyBudget?: number;
}

export interface Category {
  id: string;
  name: string;
  group?: string;      // 대메뉴 그룹명 (식비, 교통 등)
  icon: string;
  color: string;
  type: 'expense' | 'income';
  order: number;
  isDefault: boolean;
  budget?: number;
}

export interface Transaction {
  id: string;
  amount: number;
  type: 'expense' | 'income';
  categoryId: string;
  categoryName: string;
  categoryGroup?: string;  // 대메뉴 그룹명 (식비, 교통 등)
  categoryIcon: string;
  description: string;
  date: Date;
  createdBy: string;
  createdByName: string;
  source: 'auto' | 'manual';
  cardIssuer?: string;
  isCouple: boolean; // 공동통장 여부
  memo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonthlySummary {
  householdId: string;
  yearMonth: string;
  totalIncome: number;
  totalExpense: number;
  balance?: number;
  categoryBreakdown: Record<string, { categoryName: string; amount: number; count: number; budget: number }>;
  dailyTotals: Record<string, number>;
  transactionCount: number;
  byCategory?: Record<string, { name: string; icon: string; total: number; color: string }>;
  byMember?: Record<string, { name: string; total: number }>;
  updatedAt: Date;
}

export interface Budget {
  id: string;
  yearMonth: string;
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  currentSpent: number;
  createdBy: string;
  createdAt: Date;
}

export interface ParsedNotification {
  cardIssuer: string | null;
  transactionType: 'approve' | 'cancel' | null;
  amount: number | null;
  merchant: string | null;
  dateTime: string | null;
  balance: number | null;
  incomeOrExpense: 'income' | 'expense' | null;
  raw: string;
  packageName: string;
}

export interface PendingTransaction {
  id: string;
  parsed: ParsedNotification;
  suggestedCategory?: Category;
  receivedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  isCouple?: boolean; // 공동 통장 자동 판별
}

// FORCE_RELOAD_v2: 64 categories including 기타수입 group
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  // 🟢 식비 (6개 기본)
  { name: '외식', group: '식비', icon: 'restaurant-outline', color: '#FF6B6B', type: 'expense', order: 0, isDefault: true },
  { name: '점심', group: '식비', icon: 'fast-food-outline', color: '#FF7675', type: 'expense', order: 1, isDefault: true },
  { name: '배달', group: '식비', icon: 'bicycle-outline', color: '#FF8787', type: 'expense', order: 2, isDefault: true },
  { name: '장보기', group: '식비', icon: 'cart-outline', color: '#FF9F9F', type: 'expense', order: 3, isDefault: true },
  { name: '카페/음료', group: '식비', icon: 'cafe-outline', color: '#E17055', type: 'expense', order: 4, isDefault: true },
  { name: '간식', group: '식비', icon: 'ice-cream-outline', color: '#FDCB6E', type: 'expense', order: 5, isDefault: true },
  { name: '술', group: '식비', icon: 'beer-outline', color: '#E67E22', type: 'expense', order: 6, isDefault: true },
  // 🟢 교통 (5개 기본) ──
  { name: '대중교통', group: '교통', icon: 'bus-outline', color: '#74B9FF', type: 'expense', order: 6, isDefault: true },
  { name: '택시', group: '교통', icon: 'car-sport-outline', color: '#0984E3', type: 'expense', order: 7, isDefault: true },
  { name: '주유', group: '교통', icon: 'speedometer-outline', color: '#6C5CE7', type: 'expense', order: 8, isDefault: true },
  { name: '주차', group: '교통', icon: 'navigate-outline', color: '#A29BFE', type: 'expense', order: 9, isDefault: true },
  { name: '톨게이트', group: '교통', icon: 'flag-outline', color: '#5F27CD', type: 'expense', order: 10, isDefault: true },
  // ── 쇼핑 (5개) ──
  { name: '의류', group: '쇼핑', icon: 'shirt-outline', color: '#FD79A8', type: 'expense', order: 11, isDefault: true },
  { name: '생활용품', group: '쇼핑', icon: 'basket-outline', color: '#E84393', type: 'expense', order: 12, isDefault: true },
  { name: '온라인쇼핑', group: '쇼핑', icon: 'laptop-outline', color: '#D63031', type: 'expense', order: 13, isDefault: true },
  { name: '뷰티/화장품', group: '쇼핑', icon: 'sparkles-outline', color: '#FFA8D2', type: 'expense', order: 14, isDefault: true },
  { name: '가전/전자', group: '쇼핑', icon: 'tv-outline', color: '#B33771', type: 'expense', order: 15, isDefault: true },
  { name: '소품/잡화', group: '쇼핑', icon: 'cube-outline', color: '#E056A0', type: 'expense', order: 15.5, isDefault: true },
  // ── 주거/생활 (5개) ──
  { name: '월세', group: '주거/생활', icon: 'home-outline', color: '#00CEC9', type: 'expense', order: 16, isDefault: true },
  { name: '관리비', group: '주거/생활', icon: 'business-outline', color: '#00B894', type: 'expense', order: 17, isDefault: true },
  { name: '공과금', group: '주거/생활', icon: 'flash-outline', color: '#55EFC4', type: 'expense', order: 18, isDefault: true },
  { name: '통신비', group: '주거/생활', icon: 'phone-portrait-outline', color: '#00D2D3', type: 'expense', order: 19, isDefault: true },
  { name: '인터넷', group: '주거/생활', icon: 'wifi-outline', color: '#01A3A4', type: 'expense', order: 20, isDefault: true },
  { name: '생활비', group: '주거/생활', icon: 'wallet-outline', color: '#00A8CC', type: 'expense', order: 20.5, isDefault: true },
  // ── 문화/여가 (6개) ──
  { name: '영화/공연', group: '문화/여가', icon: 'film-outline', color: '#A29BFE', type: 'expense', order: 21, isDefault: true },
  { name: '취미', group: '문화/여가', icon: 'color-palette-outline', color: '#6C5CE7', type: 'expense', order: 22, isDefault: true },
  { name: '운동', group: '문화/여가', icon: 'fitness-outline', color: '#FDA7DF', type: 'expense', order: 23, isDefault: true },
  { name: '여행', group: '문화/여가', icon: 'airplane-outline', color: '#C44569', type: 'expense', order: 24, isDefault: true },
  { name: '구독서비스', group: '문화/여가', icon: 'play-circle-outline', color: '#786FA6', type: 'expense', order: 25, isDefault: true },
  { name: '게임', group: '문화/여가', icon: 'game-controller-outline', color: '#9B59B6', type: 'expense', order: 26, isDefault: true },
  // ── 의료/건강 (4개) ──
  { name: '병원', group: '의료/건강', icon: 'medical-outline', color: '#55EFC4', type: 'expense', order: 27, isDefault: true },
  { name: '약국', group: '의료/건강', icon: 'bandage-outline', color: '#00B894', type: 'expense', order: 28, isDefault: true },
  { name: '건강식품', group: '의료/건강', icon: 'nutrition-outline', color: '#1ABC9C', type: 'expense', order: 29, isDefault: true },
  { name: '피트니스', group: '의료/건강', icon: 'barbell-outline', color: '#2ECC71', type: 'expense', order: 30, isDefault: true },
  // ── 교육 (4개) ──
  { name: '학원', group: '교육', icon: 'school-outline', color: '#81ECEC', type: 'expense', order: 31, isDefault: true },
  { name: '교재', group: '교육', icon: 'book-outline', color: '#00CEC9', type: 'expense', order: 32, isDefault: true },
  { name: '온라인강의', group: '교육', icon: 'desktop-outline', color: '#0984E3', type: 'expense', order: 33, isDefault: true },
  { name: '시험/자격증', group: '교육', icon: 'document-text-outline', color: '#3498DB', type: 'expense', order: 34, isDefault: true },
  // ── 경조사/선물 (4개) ──
  { name: '축의금/부의금', group: '경조사', icon: 'heart-outline', color: '#F8A5C2', type: 'expense', order: 35, isDefault: true },
  { name: '선물', group: '경조사', icon: 'gift-outline', color: '#F78FB3', type: 'expense', order: 36, isDefault: true },
  { name: '모임비', group: '경조사', icon: 'people-outline', color: '#E66767', type: 'expense', order: 37, isDefault: true },
  { name: '회비', group: '경조사', icon: 'card-outline', color: '#C44569', type: 'expense', order: 38, isDefault: true },
  // ── 금융 (4개) ──
  { name: '보험', group: '금융', icon: 'shield-checkmark-outline', color: '#636E72', type: 'expense', order: 39, isDefault: true },
  { name: '세금', group: '금융', icon: 'receipt-outline', color: '#2D3436', type: 'expense', order: 40, isDefault: true },
  { name: '대출이자', group: '금융', icon: 'trending-down-outline', color: '#B2BEC3', type: 'expense', order: 41, isDefault: true },
  { name: '저축/투자', group: '금융', icon: 'analytics-outline', color: '#576574', type: 'expense', order: 42, isDefault: true },
  // ── 반려동물 (3개) ──
  { name: '사료/간식', group: '반려동물', icon: 'paw-outline', color: '#FDCB6E', type: 'expense', order: 43, isDefault: true },
  { name: '동물병원', group: '반려동물', icon: 'medkit-outline', color: '#F39C12', type: 'expense', order: 44, isDefault: true },
  { name: '용품/미용', group: '반려동물', icon: 'cut-outline', color: '#E67E22', type: 'expense', order: 45, isDefault: true },
  // ── 기타 (4개) ──
  { name: '편의점', group: '기타', icon: 'storefront-outline', color: '#E17055', type: 'expense', order: 46, isDefault: true },
  { name: 'ATM/수수료', group: '기타', icon: 'swap-horizontal-outline', color: '#B2BEC3', type: 'expense', order: 47, isDefault: true },
  { name: '기부', group: '기타', icon: 'hand-left-outline', color: '#74B9FF', type: 'expense', order: 48, isDefault: true },
  { name: '기타지출', group: '기타', icon: 'cash-outline', color: '#636E72', type: 'expense', order: 49, isDefault: true },
  // ── 수입: 급여 (3개) ──
  { name: '월급', group: '급여', icon: 'wallet-outline', color: '#00B894', type: 'income', order: 0, isDefault: true },
  { name: '상여금', group: '급여', icon: 'trophy-outline', color: '#00CEC9', type: 'income', order: 1, isDefault: true },
  { name: '수당', group: '급여', icon: 'cash-outline', color: '#1ABC9C', type: 'income', order: 2, isDefault: true },
  // ── 수입: 부수입 (5개) ──
  { name: '용돈', group: '부수입', icon: 'gift-outline', color: '#FDCB6E', type: 'income', order: 3, isDefault: true },
  { name: '이자수입', group: '부수입', icon: 'trending-up-outline', color: '#74B9FF', type: 'income', order: 4, isDefault: true },
  { name: '환급', group: '부수입', icon: 'return-down-back-outline', color: '#A29BFE', type: 'income', order: 5, isDefault: true },
  { name: '중고판매', group: '부수입', icon: 'pricetag-outline', color: '#F39C12', type: 'income', order: 6, isDefault: true },
  { name: '기타수입', group: '부수입', icon: 'add-circle-outline', color: '#55EFC4', type: 'income', order: 7, isDefault: true },
  // 공동 계좌 수입 (기타수입)
  { name: '회비', group: '기타수입', icon: 'people-outline', color: '#E17055', type: 'income', order: 8, isDefault: true },
  { name: '생활비', group: '기타수입', icon: 'home-outline', color: '#0984E3', type: 'income', order: 9, isDefault: true },
  { name: '비상금', group: '기타수입', icon: 'shield-checkmark-outline', color: '#D63031', type: 'income', order: 10, isDefault: true },
  { name: '이월/정산', group: '기타수입', icon: 'sync-outline', color: '#6C5CE7', type: 'income', order: 11, isDefault: true },
  { name: '기타입금', group: '기타수입', icon: 'add-circle-outline', color: '#B2BEC3', type: 'income', order: 12, isDefault: true },
];

// eslint-disable-next-line no-console
console.log('[TYPES_MODULE] DEFAULT_CATEGORIES loaded:', DEFAULT_CATEGORIES.length, 'income:', DEFAULT_CATEGORIES.filter(c => c.type === 'income').length);
