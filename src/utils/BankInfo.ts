/**
 * BankInfo.ts
 * 
 * 한국 은행/카드사 정보 공통 유틸
 * - SettingsScreen, TransactionListScreen, DashboardScreen 등에서 공유
 */

export interface BankInfo {
  packageName: string;
  name: string;       // 표시명 (NH농협, 카카오뱅크 등)
  shortName: string;  // 짧은 표시명 (NH, 카뱅 등)
  color: string;      // 브랜드 컬러
  initial: string;    // 아이콘에 표시할 이니셜
}

export const BANK_INFO: BankInfo[] = [
  { packageName: 'com.kbstar.kbank', name: 'KB국민', shortName: 'KB', color: '#FFB300', initial: 'KB' },
  { packageName: 'com.shinhan.sbanking', name: '신한', shortName: '신한', color: '#0046FF', initial: '신한' },
  { packageName: 'com.wooribank.pib.smart', name: '우리', shortName: '우리', color: '#0066B3', initial: '우리' },
  { packageName: 'com.hanabank.ebk.channel.android.hananbank', name: '하나', shortName: '하나', color: '#009B8D', initial: '하나' },
  { packageName: 'com.nonghyup.banking', name: 'NH농협', shortName: 'NH', color: '#00A651', initial: 'NH' },
  { packageName: 'com.kakaobank.channel', name: '카카오뱅크', shortName: '카뱅', color: '#FFEB00', initial: '카뱅' },
  { packageName: 'viva.republica.toss', name: '토스', shortName: '토스', color: '#0064FF', initial: '토스' },
  { packageName: 'com.ibk.neobanking', name: 'IBK기업', shortName: 'IBK', color: '#004B8D', initial: 'IBK' },
  { packageName: 'com.scbank.ma30', name: 'SC제일', shortName: 'SC', color: '#0072AA', initial: 'SC' },
  { packageName: 'com.kdb.staron', name: 'KDB산업', shortName: 'KDB', color: '#003478', initial: 'KDB' },
  { packageName: 'com.su.banking', name: '수협', shortName: '수협', color: '#005BAC', initial: '수협' },
  { packageName: 'com.dgb.smart', name: 'DGB대구', shortName: 'DGB', color: '#007BC0', initial: 'DGB' },
  { packageName: 'com.bnk.bfg', name: 'BNK부산', shortName: 'BNK', color: '#ED1C24', initial: 'BNK' },
  { packageName: 'com.knb.psb', name: '경남', shortName: '경남', color: '#D2232A', initial: '경남' },
  { packageName: 'com.jeonbukbank.jb', name: 'JB전북', shortName: 'JB', color: '#00954E', initial: 'JB' },
  { packageName: 'com.kjbank.goldwing', name: '광주', shortName: '광주', color: '#0072BC', initial: '광주' },
  { packageName: 'com.shinhancard.smartshinhan', name: '신한카드', shortName: '신카', color: '#0046FF', initial: '신카' },
  { packageName: 'com.lotte.lottemembers', name: '롯데카드', shortName: '롯데', color: '#ED1C24', initial: '롯데' },
  { packageName: 'com.hyundaicard.appcard', name: '현대카드', shortName: '현카', color: '#000000', initial: '현카' },
  { packageName: 'com.samsungcard.mpocket', name: '삼성카드', shortName: '삼카', color: '#0C4DA2', initial: '삼카' },
];

/**
 * cardIssuer 문자열(예: "카카오뱅크", "NH농협카드", "KB국민카드")로 BankInfo 찾기
 * packageName으로도 찾기 가능
 */
export function getBankInfo(cardIssuerOrPackage: string | null | undefined): BankInfo | null {
  if (!cardIssuerOrPackage) return null;

  // 1. packageName 정확 매칭
  const byPackage = BANK_INFO.find(b => b.packageName === cardIssuerOrPackage);
  if (byPackage) return byPackage;

  // 2. name 포함 매칭 (예: "KB국민카드" → "KB국민" 매칭)
  const normalized = cardIssuerOrPackage.replace(/카드$/, '').replace(/은행$/, '');
  const byName = BANK_INFO.find(b => 
    normalized.includes(b.name) || 
    b.name.includes(normalized) ||
    normalized.includes(b.shortName)
  );
  if (byName) return byName;

  // 3. 키워드 기반 폴백
  const keywordMap: Record<string, string> = {
    'KB': 'KB국민', '국민': 'KB국민',
    '신한': '신한', 'SOL': '신한',
    '우리': '우리', 'WON': '우리',
    '하나': '하나',
    'NH': 'NH농협', '농협': 'NH농협', '올원': 'NH농협',
    '카카오': '카카오뱅크', '카뱅': '카카오뱅크',
    '토스': '토스', 'toss': '토스',
    'IBK': 'IBK기업', '기업': 'IBK기업',
    'SC': 'SC제일',
    'KDB': 'KDB산업',
    '수협': '수협',
    'DGB': 'DGB대구', '대구': 'DGB대구',
    'BNK': 'BNK부산', '부산': 'BNK부산',
    '경남': '경남',
    'JB': 'JB전북', '전북': 'JB전북',
    '광주': '광주',
    '롯데': '롯데카드',
    '현대': '현대카드',
    '삼성': '삼성카드',
  };

  for (const [keyword, bankName] of Object.entries(keywordMap)) {
    if (cardIssuerOrPackage.includes(keyword)) {
      return BANK_INFO.find(b => b.name === bankName) || null;
    }
  }

  return null;
}

/**
 * cardIssuer에서 짧은 표시명 반환 (거래내역에 표시용)
 */
export function getBankShortName(cardIssuer: string | null | undefined): string | null {
  const info = getBankInfo(cardIssuer);
  return info?.shortName || null;
}

/**
 * cardIssuer에서 브랜드 컬러 반환
 */
export function getBankColor(cardIssuer: string | null | undefined): string {
  const info = getBankInfo(cardIssuer);
  return info?.color || '#888888';
}
