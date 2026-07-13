import React from 'react';
import Icon from 'react-native-vector-icons/Ionicons';

/**
 * 카테고리 이름 → Ionicons 이름 매핑
 * DB에 이모지나 잘못된 아이콘이 저장된 경우 폴백용
 */
const CATEGORY_ICON_MAP: Record<string, string> = {
  // 식비
  '외식': 'restaurant-outline',
  '배달': 'bicycle-outline',
  '장보기': 'cart-outline',
  '간식': 'ice-cream-outline',
  '카페': 'cafe-outline',
  '식비': 'restaurant-outline',
  '카페/간식': 'cafe-outline',
  // 교통
  '대중교통': 'bus-outline',
  '택시': 'car-sport-outline',
  '주유': 'speedometer-outline',
  '주차': 'navigate-outline',
  '교통': 'car-outline',
  // 쇼핑
  '의류': 'shirt-outline',
  '생활용품': 'basket-outline',
  '온라인쇼핑': 'laptop-outline',
  '쇼핑': 'bag-outline',
  // 주거/생활
  '월세': 'home-outline',
  '관리비': 'business-outline',
  '공과금': 'flash-outline',
  '통신비': 'phone-portrait-outline',
  '인터넷': 'wifi-outline',
  '주거/통신': 'home-outline',
  '주거/생활': 'home-outline',
  // 문화/여가
  '영화/공연': 'film-outline',
  '취미': 'color-palette-outline',
  '운동': 'fitness-outline',
  '여행': 'airplane-outline',
  '구독서비스': 'play-circle-outline',
  '문화/여가': 'film-outline',
  '구독': 'phone-portrait-outline',
  // 의료/건강
  '병원': 'medical-outline',
  '약국': 'bandage-outline',
  '건강식품': 'nutrition-outline',
  '의료/건강': 'medical-outline',
  // 교육
  '학원': 'school-outline',
  '교재': 'book-outline',
  '온라인강의': 'desktop-outline',
  '교육': 'book-outline',
  // 경조사/선물
  '축의금/부의금': 'heart-outline',
  '선물': 'gift-outline',
  '모임비': 'people-outline',
  // 금융
  '보험': 'shield-checkmark-outline',
  '세금': 'receipt-outline',
  // 반려동물
  '사료/간식': 'paw-outline',
  '동물병원': 'medkit-outline',
  // 기타
  '편의점': 'storefront-outline',
  '기타': 'cash-outline',
  '기타지출': 'cash-outline',
  // 수입
  '급여': 'wallet-outline',
  '월급': 'wallet-outline',
  '상여금': 'trophy-outline',
  '용돈': 'gift-outline',
  '이자수입': 'trending-up-outline',
  '환급': 'return-down-back-outline',
  '기타수입': 'add-circle-outline',
};

function isIoniconName(icon: string): boolean {
  return icon.includes('-');
}

export function resolveIcon(icon: string | undefined, categoryName?: string): string {
  if (icon && isIoniconName(icon)) {
    return icon;
  }
  if (categoryName && CATEGORY_ICON_MAP[categoryName]) {
    return CATEGORY_ICON_MAP[categoryName];
  }
  return 'cash-outline';
}

interface CategoryIconProps {
  icon?: string;
  categoryName?: string;
  size: number;
  color: string;
  style?: any;
}

const CategoryIcon: React.FC<CategoryIconProps> = ({ icon, categoryName, size, color, style }) => {
  const resolvedIcon = resolveIcon(icon, categoryName);
  return <Icon name={resolvedIcon} size={size} color={color} style={style} />;
};

export default CategoryIcon;
