/**
 * CategoryAutoMapper.ts
 *
 * Keyword-based + user-learned auto-categorization for Korean merchant names.
 * 
 * 1. 사용자가 거래를 승인할 때 merchant → category 매핑을 AsyncStorage에 저장
 * 2. 다음에 같은 merchant가 오면 사용자가 설정한 카테고리를 자동 제안
 * 3. 매칭 안 되면 키워드 기반 정적 매핑 사용
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LEARNED_KEY = '@PairBudget:learnedCategories';

// ---------------------------------------------------------------------------
// Keyword → Category map (새 소메뉴 구조에 맞게 업데이트)
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '외식': [
    '식당', '음식', '치킨', '피자', '햄버거', '국밥', '김밥', '족발', '떡볶이',
    '맥도날드', '버거킹', '롯데리아', 'KFC', '서브웨이',
    '한식', '중식', '일식', '양식',
  ],
  '배달': [
    '배달의민족', '요기요', '쿠팡이츠', '배민',
  ],
  '카페/음료': [
    '스타벅스', '투썸', '이디야', '메가커피', '컴포즈', '빽다방', '할리스',
    '카페', '커피', '바리스타',
  ],
  '간식': [
    '베이커리', '빵', '던킨', '배스킨라빈스', '파리바게뜨', '뚜레쥬르',
    '아이스크림', '과자',
  ],
  '장보기': [
    '이마트', '홈플러스', '롯데마트', '코스트코', '하나로마트',
    '마트', '슈퍼', '농산물',
  ],
  '대중교통': [
    '버스', '지하철', 'T머니', '교통카드',
  ],
  '택시': [
    '택시', '카카오택시', '타다', '카카오T',
  ],
  '주유': [
    '주유', 'SK에너지', 'GS칼텍스', 'S-OIL', '현대오일', '알뜰주유소',
  ],
  '주차': [
    '주차', '파킹',
  ],
  '톨게이트': [
    '고속도로', '톨게이트', '하이패스',
  ],
  '의류': [
    '무신사', '자라', 'ZARA', 'H&M', '유니클로', '나이키', '아디다스',
  ],
  '생활용품': [
    '다이소', '올리브영',
  ],
  '온라인쇼핑': [
    '쿠팡', '네이버쇼핑', '11번가', 'G마켓', '옥션', '위메프', '티몬',
  ],
  '뷰티/화장품': [
    '올리브영', '이니스프리', '아모레', '화장품',
  ],
  '영화/공연': [
    'CGV', '롯데시네마', '메가박스', '공연', '뮤지컬',
  ],
  '구독서비스': [
    '넷플릭스', '유튜브', '멜론', '스포티파이', '디즈니', '웨이브', '왓챠',
    '구독', '멤버십',
  ],
  '게임': [
    'PC방', '게임', '스팀', '넥슨', '카카오게임',
  ],
  '병원': [
    '병원', '의원', '치과', '안과', '피부과', '정형외과', '내과',
  ],
  '약국': [
    '약국', '팜',
  ],
  '편의점': [
    'GS25', 'CU', '세븐일레븐', '이마트24', '미니스톱', '편의점',
  ],
  '통신비': [
    'SK텔레콤', 'SKT', 'KT', 'LG유플러스', 'LGU+', 'LG U+', '엘지유플러스', '통신',
  ],
  '보험': [
    '보험', '삼성생명', '한화생명', '교보생명',
  ],
};

// ---------------------------------------------------------------------------
// Learned mappings: merchant → { categoryId, categoryName, group }
// Persisted in AsyncStorage
// ---------------------------------------------------------------------------

interface LearnedMapping {
  categoryId: string;
  categoryName: string;
  group?: string;
}

let learnedMappings: Map<string, LearnedMapping> = new Map();

/** Load learned mappings from AsyncStorage (항상 최신 데이터 로드) */
async function loadLearnedMappings(): Promise<void> {
  try {
    const json = await AsyncStorage.getItem(LEARNED_KEY);
    if (json) {
      const entries: [string, LearnedMapping][] = JSON.parse(json);
      learnedMappings = new Map(entries);
    }
  } catch {
    // ignore
  }
}

/** Save learned mappings to AsyncStorage */
async function saveLearnedMappings(): Promise<void> {
  try {
    const entries = Array.from(learnedMappings.entries());
    await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Pre-built keyword lookup index
// ---------------------------------------------------------------------------

interface KeywordEntry {
  keyword: string;
  category: string;
}

const keywordIndex: KeywordEntry[] = [];

for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
  for (const kw of keywords) {
    keywordIndex.push({ keyword: kw, category });
  }
}

keywordIndex.sort((a, b) => b.keyword.length - a.keyword.length);

// ---------------------------------------------------------------------------
// 브랜드/프랜차이즈 → 카테고리 (최우선 매칭, 지점명 무시)
// ---------------------------------------------------------------------------

const BRAND_CATEGORIES: Record<string, string> = {
  // 카페
  '스타벅스': '카페/음료', '투썸플레이스': '카페/음료', '투썸': '카페/음료',
  '이디야': '카페/음료', '메가커피': '카페/음료', '메가MGC커피': '카페/음료',
  '컴포즈커피': '카페/음료', '컴포즈': '카페/음료',
  '빽다방': '카페/음료', '할리스': '카페/음료', '폴바셋': '카페/음료',
  '텐퍼센트커피': '카페/음료', '텐퍼센트': '카페/음료',
  '더벤티': '카페/음료', '감성커피': '카페/음료', '매머드': '카페/음료',
  '파스쿠찌': '카페/음료', '커피빈': '카페/음료', '탐앤탐스': '카페/음료',
  '블루보틀': '카페/음료', '빈스빈스': '카페/음료',
  // 베이커리/간식
  '파리바게뜨': '간식', '뚜레쥬르': '간식', '던킨': '간식',
  '배스킨라빈스': '간식', 'BR': '간식',
  '크리스피크림': '간식', '성심당': '간식',
  // 외식/패스트푸드
  '맥도날드': '외식', '버거킹': '외식', '롯데리아': '외식',
  'KFC': '외식', '서브웨이': '외식', '맘스터치': '외식',
  '한솥': '외식', '본죽': '외식', '놀부': '외식',
  '교촌치킨': '외식', 'BBQ': '외식', 'BHC': '외식', '굽네치킨': '외식',
  '도미노피자': '외식', '피자헛': '외식', '미스터피자': '외식',
  // 편의점
  'GS25': '편의점', 'CU': '편의점', '세븐일레븐': '편의점',
  '이마트24': '편의점', '미니스톱': '편의점',
  // 마트
  '이마트': '장보기', '홈플러스': '장보기', '롯데마트': '장보기',
  '코스트코': '장보기', '하나로마트': '장보기', '트레이더스': '장보기',
  // 생활
  '다이소': '생활용품', '올리브영': '뷰티/화장품',
  // 영화
  'CGV': '영화/공연', '롯데시네마': '영화/공연', '메가박스': '영화/공연',
  // 구독
  '넷플릭스': '구독서비스', '유튜브': '구독서비스',
  '멜론': '구독서비스', '스포티파이': '구독서비스',
  // 주유
  'SK에너지': '주유', 'GS칼텍스': '주유', 'S-OIL': '주유',
};

// 브랜드 매칭용 인덱스 (긴 이름 우선)
const brandIndex = Object.entries(BRAND_CATEGORIES)
  .sort(([a], [b]) => b.length - a.length);

// ---------------------------------------------------------------------------
// 지점명 패턴 제거 (카테고리 판단에 불필요)
// "텐퍼센트 안산고대병원점" → "텐퍼센트"
// ---------------------------------------------------------------------------

function stripBranchName(merchant: string): string {
  // "~점", "~호점", "~지점", "~센터" 등의 지점명 패턴 제거
  return merchant
    .replace(/\s*[가-힣A-Za-z0-9]+(?:점|호점|지점|센터|매장|분점)$/g, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * merchant 이름으로 카테고리를 자동 매핑
 * 
 * 우선순위:
 * 1. 사용자 학습 매핑 (정확히 같은 merchant)
 * 2. 브랜드/프랜차이즈 매칭 (지점명 무시)
 * 3. 키워드 기반 정적 매핑 (지점명 제거 후)
 * 4. 키워드 기반 정적 매핑 (원본)
 */
export function autoMapCategory(merchant: string): string | null {
  if (!merchant) return null;
  const normalized = merchant.trim();

  // 1. 학습된 매핑 — 정확 일치 (categoryName 반환)
  const learned = learnedMappings.get(normalized);
  if (learned) {
    return learned.categoryName;
  }

  // 1-b. 학습된 매핑 — 퍼지 매칭
  //      지점명 제거 후 비교 + 부분 문자열 포함 비교
  //      "구글플레이"를 학습했으면 "구글페이먼트코리아 유한회사"도 매칭 (포함 관계)
  const stripped = stripBranchName(normalized);
  for (const [key, mapping] of learnedMappings) {
    // 지점명 제거 후 일치
    if (stripped !== normalized && stripped.length >= 2) {
      const keyStripped = stripBranchName(key);
      if (keyStripped === stripped) {
        return mapping.categoryName;
      }
    }
    // 부분 문자열 포함 (한쪽이 다른 쪽을 포함하면 같은 가맹점)
    if (key.length >= 3 && normalized.length >= 3) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return mapping.categoryName;
      }
    }
  }

  // 2. 브랜드 매칭 (지점명 포함해도 브랜드명만으로 매칭)
  for (const [brand, category] of brandIndex) {
    if (normalized.includes(brand)) {
      return category;
    }
  }

  // 3. 지점명 제거 후 키워드 매칭
  if (stripped !== normalized && stripped.length > 0) {
    for (const entry of keywordIndex) {
      if (stripped.includes(entry.keyword)) {
        return entry.category;
      }
    }
  }

  // 4. 원본으로 키워드 매칭
  for (const entry of keywordIndex) {
    if (normalized.includes(entry.keyword)) {
      return entry.category;
    }
  }

  return null;
}

/**
 * 학습된 매핑에서 카테고리 ID를 가져옴 (Firestore 카테고리 ID)
 */
export function getLearnedCategoryId(merchant: string): string | null {
  if (!merchant) return null;
  const mapping = getLearnedMapping(merchant);
  return mapping?.categoryId || null;
}

/**
 * 학습된 매핑 전체 가져오기 (group 포함) — 퍼지 매칭 지원
 */
export function getLearnedMapping(merchant: string): LearnedMapping | null {
  if (!merchant) return null;
  const normalized = merchant.trim();

  // 정확 일치
  const exact = learnedMappings.get(normalized);
  if (exact) return exact;

  // 퍼지 매칭 (지점명 제거 + 부분 문자열 포함)
  const stripped = stripBranchName(normalized);
  for (const [key, mapping] of learnedMappings) {
    if (stripped !== normalized && stripped.length >= 2) {
      if (stripBranchName(key) === stripped) return mapping;
    }
    if (key.length >= 3 && normalized.length >= 3) {
      if (normalized.includes(key) || key.includes(normalized)) return mapping;
    }
  }

  return null;
}

/**
 * 사용자가 거래를 승인할 때 호출 — merchant → category 매핑을 학습
 * 
 * @param merchant      파싱된 가맹점/상대방 이름
 * @param categoryId    사용자가 선택한 카테고리의 Firestore ID
 * @param categoryName  카테고리 이름 (예: "외식")
 * @param group         대메뉴 그룹명 (예: "식비")
 */
export async function learnCategoryMapping(
  merchant: string,
  categoryId: string,
  categoryName: string,
  group?: string,
): Promise<void> {
  if (!merchant || !categoryId) return;
  const normalized = merchant.trim();
  if (normalized.length < 2) return; // 너무 짧은 건 학습 안 함

  learnedMappings.set(normalized, { categoryId, categoryName, group });
  await saveLearnedMappings();
}

/**
 * 앱 시작 시 호출 — AsyncStorage에서 학습 데이터 로드
 */
export async function initCategoryMapper(): Promise<void> {
  await loadLearnedMappings();
}

/**
 * 학습 데이터 초기화
 */
export async function resetLearnedMappings(): Promise<void> {
  learnedMappings.clear();
  await AsyncStorage.removeItem(LEARNED_KEY);
}
