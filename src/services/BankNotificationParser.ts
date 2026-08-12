import { ParsedNotification } from '../types';

export const BANK_PACKAGES: string[] = [
  // ─── 시중은행 (뱅킹 앱) ────────────────────────────────────────────────
  'com.kbstar.kbank',                              // KB스타뱅킹
  'com.kbstar.kbbank',                              // KB스타뱅킹 (변형)
  'com.kbstar.liivbank',                            // KB Liiv (구버전)
  'com.kbstar.reboot',                              // KB스타뱅킹 (리부트)
  'com.shinhan.sbanking',                           // 신한 SOL뱅크
  'com.wooribank.pib.smart',                        // 우리WON뱅킹
  'com.wooribank.smart.npib',                       // 우리WON뱅킹 (신버전)
  'com.hanabank.ebk.channel.android.hananbank',     // 하나원큐
  'com.nonghyup.banking',                           // NH스마트뱅킹
  'nh.smart.nhcok',                                 // NH콕뱅크
  'nh.smart.nhallonepay',                           // NH올원페이
  'com.kakaobank.channel',                          // 카카오뱅크
  'viva.republica.toss',                            // 토스
  'com.kbankwith.smartbank',                        // 케이뱅크
  // ─── 특수은행/기타은행 ──────────────────────────────────────────────────
  'com.ibk.neobanking',                             // IBK기업은행
  'com.ibk.busbank',                                // IBK기업은행 (구)
  'com.scbank.ma30',                                // SC제일은행
  'com.sc.danb.scbank',                             // SC제일은행 (신)
  'com.kdb.staron',                                 // KDB산업은행
  'com.su.banking',                                 // 수협은행
  // ─── 지방은행 ──────────────────────────────────────────────────────────
  'com.dgb.smart',                                  // iM뱅크 (대구)
  'com.dgb.dgbmobile',                              // iM뱅크 (대구, 신)
  'com.bnk.bfg',                                    // BNK부산
  'com.busanbank.mobile',                           // BNK부산 (신)
  'com.knb.psb',                                    // BNK경남
  'com.knbank.mobile',                              // BNK경남 (신)
  'com.jeonbukbank.jb',                             // JB전북
  'kr.co.jbbank.privatebank',                       // JB전북 (신)
  'com.kjbank.goldwing',                            // 광주은행
  'com.kjbank.mobile',                              // 광주은행 (신)
  'com.ejeju.jbank',                                // 제주은행
  'kr.co.citibank.citimobile',                      // 한국씨티은행
  // ─── 카드사 앱 ────────────────────────────────────────────────────────
  'com.shinhancard.smartshinhan',                   // 신한 SOL페이
  'com.shcard.smartpay',                            // 신한카드 (구)
  'com.lotte.lottemembers',                         // 롯데카드 (구)
  'com.lcacApp',                                    // 롯데카드 (신)
  'com.hyundaicard.appcard',                        // 현대카드
  'com.samsungcard.mpocket',                        // 삼성카드
  'kr.co.samsungcard.mpocket',                      // 삼성카드 (변형)
  'com.wooricard.smartapp',                         // 우리카드
  'com.hanaskcard.paycla',                          // 하나카드
  'kvp.jjy.MispAndroid320',                         // BC카드
  'com.kbcard.cxh.appcard',                         // KB Pay
  'com.kbcard.kbkookmincard',                       // KB국민카드 (구)
  // ─── 간편결제/페이 ────────────────────────────────────────────────────
  'com.samsung.android.spay',                       // 삼성페이
  'com.nhnent.payapp',                              // 페이코
  'com.kftc.bankpay.android',                       // 뱅크페이
  // ─── 증권사 ───────────────────────────────────────────────────────────
  'com.mirae.asset.trade',                          // 미래에셋
  'com.kiwoom.hero',                                // 키움증권
  'com.samsung.securities.mstock',                  // 삼성증권
  'com.nhqv.newsmartstock',                         // NH투자증권
  'com.kbsec.mts',                                  // KB증권
  'com.shinhaninvest.neosmartw',                    // 신한투자증권
];

export const KAKAO_FINANCE_CHANNELS: string[] = [
  '카카오페이',
  '카카오뱅크',
  '토스',
  '신한카드',
  '우리카드',
  'KB국민카드',
  'NH농협카드',
  '삼성카드',
  '현대카드',
  '하나카드',
  '롯데카드',
  '비씨카드',
];

export const SMS_PACKAGES: string[] = [
  'com.samsung.android.messaging',                  // 삼성 메시지
  'com.google.android.apps.messaging',              // 구글 메시지
  'com.android.mms',                                // 기본 MMS
  'com.android.messaging',                          // AOSP 메시지
  'com.skt.prod.dialer',                            // SKT
  'com.skt.skaf.OA00018282',                        // T전화
  'com.kt.olleh.icloud',                            // KT
  'com.lguplus.usimsafety',                         // LG U+
  'com.kakao.talk',                                 // 카카오톡 (카카오페이 알림)
];

/**
 * 패키지명 → 브랜드명 매핑
 * "이 돈이 어디서 나간 건지" 한눈에 보여주는 핵심 테이블.
 */
const PACKAGE_BRAND_MAP: Record<string, string> = {
  // ─── 시중은행 ──────────────────────────────────────────────────────────
  'com.kbstar.kbank': 'KB국민',
  'com.kbstar.kbbank': 'KB국민',
  'com.kbstar.liivbank': 'KB국민',
  'com.kbstar.reboot': 'KB국민',
  'com.shinhan.sbanking': '신한',
  'com.wooribank.pib.smart': '우리',
  'com.wooribank.smart.npib': '우리',
  'com.hanabank.ebk.channel.android.hananbank': '하나',
  'com.nonghyup.banking': '농협',
  'nh.smart.nhcok': '농협',
  'nh.smart.nhallonepay': '농협',
  'com.kakaobank.channel': '카카오뱅크',
  'viva.republica.toss': '토스',
  'com.kbankwith.smartbank': '케이뱅크',
  // ─── 특수은행 ──────────────────────────────────────────────────────────
  'com.ibk.neobanking': 'IBK기업',
  'com.ibk.busbank': 'IBK기업',
  'com.scbank.ma30': 'SC제일',
  'com.sc.danb.scbank': 'SC제일',
  'com.kdb.staron': 'KDB산업',
  'com.su.banking': '수협',
  // ─── 지방은행 ──────────────────────────────────────────────────────────
  'com.dgb.smart': 'iM뱅크',
  'com.dgb.dgbmobile': 'iM뱅크',
  'com.bnk.bfg': 'BNK부산',
  'com.busanbank.mobile': 'BNK부산',
  'com.knb.psb': 'BNK경남',
  'com.knbank.mobile': 'BNK경남',
  'com.jeonbukbank.jb': 'JB전북',
  'kr.co.jbbank.privatebank': 'JB전북',
  'com.kjbank.goldwing': '광주',
  'com.kjbank.mobile': '광주',
  'com.ejeju.jbank': '제주',
  'kr.co.citibank.citimobile': '씨티',
  // ─── 카드사 앱 ────────────────────────────────────────────────────────
  'com.shinhancard.smartshinhan': '신한',
  'com.shcard.smartpay': '신한',
  'com.lotte.lottemembers': '롯데',
  'com.lcacApp': '롯데',
  'com.hyundaicard.appcard': '현대',
  'com.samsungcard.mpocket': '삼성',
  'kr.co.samsungcard.mpocket': '삼성',
  'com.wooricard.smartapp': '우리',
  'com.hanaskcard.paycla': '하나',
  'kvp.jjy.MispAndroid320': 'BC',
  'com.kbcard.cxh.appcard': 'KB국민',
  'com.kbcard.kbkookmincard': 'KB국민',
  // ─── 간편결제/페이 ────────────────────────────────────────────────────
  'com.samsung.android.spay': '삼성페이',
  'com.nhnent.payapp': '페이코',
  'com.kftc.bankpay.android': '뱅크페이',
  // ─── 증권사 ───────────────────────────────────────────────────────────
  'com.mirae.asset.trade': '미래에셋',
  'com.kiwoom.hero': '키움증권',
  'com.samsung.securities.mstock': '삼성증권',
  'com.nhqv.newsmartstock': 'NH투자',
  'com.kbsec.mts': 'KB증권',
  'com.shinhaninvest.neosmartw': '신한투자',
  // ─── 메신저 ──────────────────────────────────────────────
  // com.kakao.talk은 메신저라 카카오페이/카카오뱅크/기타 카드사 등 다양한 금융 알림이 오므로
  // 특정 브랜드로 고정하지 않음. 알림 원문에서 은행/카드사를 파싱하여 결정.
};

/** 패키지명으로 브랜드명을 반환. 매핑에 없으면 null */
export function getBrandName(packageName: string): string | null {
  return PACKAGE_BRAND_MAP[packageName] ?? null;
}

const AMOUNT_RE = /(\d{1,3}(?:,\d{3})*)\s*원/;
const ISSUER_RE = /\[(.*?)\]/;
const DATE_FMT1_RE = /(\d{2}\/\d{2}\s\d{2}:\d{2})/;
const DATE_FMT2_RE = /(\d{1,2})월\s*(\d{1,2})일\s*(\d{2}:\d{2})/;
const DATE_FMT3_RE = /(\d{4})\.(\d{2})\.(\d{2})\s*(\d{2}:\d{2})?/;
const BALANCE_RE = /잔액\s*(\d{1,3}(?:,\d{3})*)\s*원/;

/** 금융 브랜드 키워드 → 브랜드명 매핑 (긴 키워드 우선 매칭) */
const ISSUER_KEYWORDS: [RegExp, string][] = [
  // 카드사 (구체적 명칭 우선)
  [/NH농협카드/, '농협'],
  [/NH농협/, '농협'],
  [/농협카드/, '농협'],
  [/KB국민카드/, 'KB국민'],
  [/KB국민/, 'KB국민'],
  [/국민카드/, 'KB국민'],
  [/신한카드/, '신한'],
  [/우리카드/, '우리'],
  [/하나카드/, '하나'],
  [/삼성카드/, '삼성'],
  [/현대카드/, '현대'],
  [/롯데카드/, '롯데'],
  [/비씨카드/, 'BC'],
  [/BC카드/, 'BC'],
  // 은행
  [/카카오뱅크/, '카카오뱅크'],
  [/케이뱅크/, '케이뱅크'],
  [/토스뱅크/, '토스'],
  [/토스/, '토스'],
  [/신한은행/, '신한'],
  [/우리은행/, '우리'],
  [/하나은행/, '하나'],
  [/국민은행/, 'KB국민'],
  [/농협은행/, '농협'],
  [/농협/, '농협'],
  [/\bNH\b/, '농협'],
  [/기업은행/, 'IBK기업'],
  [/IBK/, 'IBK기업'],
  [/SC제일/, 'SC제일'],
  [/산업은행/, 'KDB산업'],
  [/KDB/, 'KDB산업'],
  [/수협/, '수협'],
  [/대구은행/, 'DGB대구'],
  [/DGB/, 'DGB대구'],
  [/부산은행/, 'BNK부산'],
  [/BNK/, 'BNK부산'],
  [/경남은행/, '경남'],
  [/전북은행/, 'JB전북'],
  [/광주은행/, '광주'],
  // 페이 서비스
  [/카카오페이/, '카카오페이'],
  [/네이버페이/, '네이버페이'],
  [/삼성페이/, '삼성페이'],
  [/페이코/, '페이코'],
  [/제로페이/, '제로페이'],
  [/토스페이/, '토스'],
  // 짧은 키워드 (마지막에 배치 - 다른 것에 매칭 안 됐을 때만)
  [/\bKB\b/, 'KB국민'],
];

function parseAmount(text: string): number | null {
  // 잔액, 누적 금액은 제외하고 결제 금액만 추출
  // 잔액/누적 부분을 먼저 제거
  const cleaned = text
    .replace(/잔액\s*[\d,]+\s*원?/g, '')
    .replace(/누적\s*[\d,]+\s*원?/g, '')
    .replace(/한도\s*[\d,]+\s*원?/g, '');
  const m = cleaned.match(AMOUNT_RE);
  if (!m) {
    // 원래 텍스트에서 다시 시도 (잔액밖에 없는 경우)
    const m2 = text.match(AMOUNT_RE);
    return m2 ? Number(m2[1].replace(/,/g, '')) : null;
  }
  return Number(m[1].replace(/,/g, ''));
}

function parseIssuer(text: string): string | null {
  // 1차: [대괄호] 안에서 추출 (가장 정확)
  const bracketMatch = text.match(ISSUER_RE);
  if (bracketMatch) {
    const bracketContent = bracketMatch[1].trim();
    // 대괄호 내용이 금융 브랜드인 경우 간결한 이름으로 변환
    for (const [re, brand] of ISSUER_KEYWORDS) {
      if (re.test(bracketContent)) return brand;
    }
    // 매핑에 없더라도 대괄호 내용이 의미 있으면 그대로 반환
    // (단, "Web발신", "국제발신" 같은 무의미한 내용은 제외)
    if (!/발신|안내|알림$/.test(bracketContent) && bracketContent.length <= 15) {
      return bracketContent;
    }
  }

  // 2차: 텍스트 본문에서 금융 키워드 매칭
  for (const [re, brand] of ISSUER_KEYWORDS) {
    if (re.test(text)) return brand;
  }

  return null;
}

function parseDateTime(text: string): string | null {
  // 우선순위: "6월 9일 14:30" > "06/09 14:30" > "2026.06.09 14:30"
  const m2 = text.match(DATE_FMT2_RE);
  if (m2) {
    const month = m2[1].padStart(2, '0');
    const day = m2[2].padStart(2, '0');
    return `${month}/${day} ${m2[3]}`;
  }
  const m1 = text.match(DATE_FMT1_RE);
  if (m1) return m1[1];
  const m3 = text.match(DATE_FMT3_RE);
  if (m3) return `${m3[2]}/${m3[3]}${m3[4] ? ' ' + m3[4] : ''}`;
  return null;
}

const CANCEL_KEYWORDS = ['승인취소', '취소승인', '결제취소', '취소'];
const APPROVE_KEYWORDS = ['승인', '결제', '입금', '출금', '이체', '입금완료', '출금완료', '이체완료', '송금받기', '사용'];
const INCOME_KEYWORDS = ['입금', '수입', '입금완료', '송금받기', '환불', '캐시백', '적립'];
const EXPENSE_KEYWORDS = ['출금', '승인', '결제', '이체', '이체완료', '출금완료', '사용', '인출'];

function parseTransactionType(text: string): ParsedNotification['transactionType'] {
  if (CANCEL_KEYWORDS.some(k => text.includes(k))) return 'cancel';
  if (APPROVE_KEYWORDS.some(k => text.includes(k))) return 'approve';
  return null;
}

function parseIncomeOrExpense(text: string): ParsedNotification['incomeOrExpense'] {
  // '입출금' 단어가 '출금'으로 오탐되는 것 방지
  const safeText = text.replace(/입출금/g, '통장');

  // 취소 = 환불이므로 수입 처리
  if (CANCEL_KEYWORDS.some(k => safeText.includes(k))) return 'income';

  // 0단계: "입금되었어요", "입금되었습니다" 같은 확정적 입금 표현 (카카오뱅크 등)
  if (/입금되었어요|입금되었습니다|입금됐어요|입금\s*완료/.test(safeText)) return 'income';

  // 1단계: 금액 직전의 거래 동사로 판별 (가장 정확)
  const verbAmountMatch = safeText.match(
    /(입금|출금|승인|결제|이체|인출|사용|환불|캐시백|적립)\s*\d{1,3}(?:,\d{3})*\s*원/
  );
  if (verbAmountMatch) {
    const verb = verbAmountMatch[1];
    if (['입금', '환불', '캐시백', '적립'].includes(verb)) return 'income';
    return 'expense'; // 출금, 승인, 결제, 이체, 인출, 사용
  }

  // 2단계: 복합 거래 키워드 (금액과 분리된 형태)
  if (/입금완료|송금받기/.test(safeText)) return 'income';
  if (/출금완료|이체완료/.test(safeText)) return 'expense';

  // 3단계: Fallback — 지출 키워드를 먼저 체크
  // "수입"은 가맹점명(세외수입 등)에 흔히 포함되므로 안전 키워드에서 제외
  if (EXPENSE_KEYWORDS.some(k => safeText.includes(k))) return 'expense';
  if (['입금', '환불', '캐시백', '적립'].some(k => safeText.includes(k))) return 'income';

  return 'expense';
}

function parseBalance(text: string): number | null {
  const m = text.match(BALANCE_RE);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ''));
}

// ---------------------------------------------------------------------------
// 가맹점명 추출 (위치 기반 + standalone 키워드 제거)
/**
 * 가맹점명 추출.
 *
 * 전략: 구조적 요소(금액, 날짜, 계좌번호, 잔액)를 마커로 치환 → 분할 →
 *       각 파트에서 "첫 번째 공백 전까지"만 가맹점명 후보로 취급.
 *       (은행 알림에서 가맹점명 뒤에 오는 부가정보는 항상 공백 뒤에 붙기 때문)
 *
 * "명동건 전자금융입금 1 잔액3" → "명동건"
 * "NICE_결제대" → "NICE_결제대" (공백 없으므로 전체가 가맹점)
 * "스타벅스코엑스점" → "스타벅스코엑스점"
 */
function parseMerchantGeneric(text: string): string | null {
  let w = text;

  // 0. 자동출금/자동이체(상대방) 패턴 선 추출
  //    "자동출금46,200원(KT8687465206)" → "KT8687465206"
  const autoPayMatch = w.match(/(?:자동출금|자동이체|자동납부)[^(]*\(([^)]+)\)/);
  if (autoPayMatch) {
    let extracted = autoPayMatch[1].trim();
    // 통신사+전화번호 → 통신사명만 추출
    extracted = cleanTelecomMerchant(extracted);
    if (extracted.length >= 2) return extracted;
  }

  // 1. 구조적 패턴을 마커(§)로 치환
  w = w.replace(/잔액\s*[\d,]+\s*원?/g, '§');
  w = w.replace(/누적\s*[\d,]+\s*원?/g, '§');
  w = w.replace(/한도\s*[\d,]+\s*원?/g, '§');
  w = w.replace(/[\d,]+\s*원/g, '§');
  w = w.replace(/\d{2}\/\d{2}\s?\d{2}:\d{2}/g, '§');
  w = w.replace(/\d{1,2}월\s*\d{1,2}일\s*\d{2}:\d{2}/g, '§');
  w = w.replace(/\d{4}\.\d{2}\.\d{2}/g, '§');
  w = w.replace(/\d{2}:\d{2}/g, '§');
  w = w.replace(/[\d\-\*]{8,}/g, '§');       // 계좌/카드 번호
  w = w.replace(/\(\d{3,6}\)/g, '§');         // (1893) 계좌 끝자리
  // 통신사+전화번호 패턴을 통신사명으로 치환 (괄호 안이 아닌 경우)
  w = w.replace(/\((?:KT|SKT|SK텔레콤|LGU\+?|LG유플러스|엘지유플러스)\d{6,12}\)/g, (match) => {
    const carrier = match.replace(/[\d()]/g, '');
    return carrier || '§';
  });
  w = w.replace(/\[.*?\]/g, '§');             // [KB국민카드] 등 대괄호
  // 마스킹된 개인정보 (명*건, 홍*동, 9*8* 등 * 포함 토큰)
  w = w.replace(/\S*\*+\S*/g, '§');
  // 복합 금융용어 (공백 포함 가능)
  w = w.replace(/입출금\s*(?:통장|알림)?/g, '§');
  w = w.replace(/전자금융\s*입금/g, '§');

  // 2. 마커로 분할
  const parts = w
    .split(/§+|[|]|\s*(?:->|=>|▶|➔|➡|〉|→|⇒|⇨|►)\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // 4. 단독 노이즈 단어 필터 (가맹점명이 절대 될 수 없는 한 글자~두 글자 금융 키워드)
  const noiseWords = new Set([
    '승인', '결제', '출금', '입금', '이체', '취소', '거절', '사용',
    '체크', '신용', '해외', '일시불', '인출', '환불', '알림',
    '통장', '잔액', '은행', '카드', '님', '건',
    '입출금통장', '자유입출금',
    // 거래 수단/방식 (가맹점명 불가)
    '스마트폰출금', '스마트폰입금', 'ATM출금', 'ATM입금',
    'CD출금', 'CD입금', '자동이체', '타행이체', '당행이체',
    '자동출금', '자동납부',
    '인터넷뱅킹', '모바일뱅킹', '폰뱅킹', '텔레뱅킹',
    'KB', 'NH',
  ]);

  // 3. 각 파트에서 "첫 번째 공백 전까지"만 추출 (가맹점명은 공백 없이 연속)
  const candidates = parts
    .map(part => {
      // 파트 내에서 단독 노이즈 단어 제거 후 남은 텍스트 보존
      const words = part.split(/\s+/);
      const cleaned = words.filter(w2 => {
        if (w2.length === 0) return false;
        if (/^[\d\s]*$/.test(w2)) return false;  // 순수 숫자
        if (noiseWords.has(w2)) return false;     // 정확히 일치하는 노이즈 단어만 제거
        return true;
      }).join(' ').trim();
      // 앞뒤 특수문자 정리 (짝 있는 괄호는 유지)
      let result = cleaned.replace(/^[\-:]+/, '').replace(/[\-:]+$/, '');
      // 짝 없는 닫는 괄호만 제거
      const openCount = (result.match(/\(/g) || []).length;
      const closeCount = (result.match(/\)/g) || []).length;
      if (closeCount > openCount) {
        // 끝에서부터 초과분만큼 ) 제거
        let excess = closeCount - openCount;
        result = result.replace(/\)+$/, (m) => m.substring(0, Math.max(0, m.length - excess)));
      }
      return result;
    })
    .filter(s => {
      if (s.length === 0) return false;
      if (/^[\d\s]*$/.test(s)) return false;          // 순수 숫자 제거
      if (/님$/.test(s) && s.length <= 4) return false; // *건님 등 이름 제거
      if (/^[→>▶➔➡►⇒⇨〉\-=]+$/.test(s)) return false; // 화살표 기호 제거
      return true;
    });


  // 노이즈 단어 필터는 위 candidates 생성 시 이미 적용됨
  const meaningful = candidates.filter(c => !noiseWords.has(c));

  if (meaningful.length === 0) return null;

  // 5. 마지막 의미 있는 후보가 가맹점 (보통 뒤쪽에 위치)
  let merchant = meaningful[meaningful.length - 1];
  // 통신사+전화번호 정리
  merchant = cleanTelecomMerchant(merchant);
  if (merchant.length > 30) merchant = merchant.substring(0, 30);

  return merchant || null;
}

/**
 * 통신사+전화번호 패턴을 통신사명만으로 정리
 * "KT8687465206" → "KT"
 * "SKT01012345678" → "SKT"
 * "LGU+01098765432" → "LG U+"
 */
function cleanTelecomMerchant(name: string): string {
  // KT + 숫자
  if (/^KT\d{6,}$/i.test(name)) return 'KT';
  // SKT / SK텔레콤 + 숫자
  if (/^(?:SKT|SK텔레콤)\d{6,}$/i.test(name)) return 'SKT';
  // LGU+ / LG유플러스 + 숫자
  if (/^(?:LGU\+?|LG유플러스|엘지유플러스)\d{6,}$/i.test(name)) return 'LG U+';
  // 일반 패턴: 한글/영문 + 전화번호(10~12자리)
  const match = name.match(/^([가-힣A-Za-z\+]+)\d{10,12}$/);
  if (match) return match[1];
  return name;
}

// ---------------------------------------------------------------------------
// 거래 해시 생성 (중복 방지용)
// ---------------------------------------------------------------------------

/**
 * 거래의 고유 지문을 생성합니다.
 * 같은 거래(같은 은행, 같은 금액, 같은 시간대)는 동일한 해시를 갖습니다.
 * A와 B 모두 같은 공동통장 알림을 받아도 해시가 같으므로 중복 방지 가능.
 *
 * @param fallbackTime dateTime이 null일 때 대신 사용할 시간 (receivedAt 또는 smsDate).
 *                     분 단위로 잘라서 사용하므로 수 초 차이는 무시됩니다.
 */
export function generateTransactionHash(
  amount: number,
  merchant: string | null,
  dateTime: string | null,
  cardIssuer: string | null,
  fallbackTime?: Date | string,
): string {
  let timeKey: string;
  if (dateTime) {
    timeKey = dateTime;
  } else if (fallbackTime) {
    // receivedAt/smsDate → 분 단위로 잘라서 안정적인 해시 생성
    const d = new Date(fallbackTime);
    timeKey = isNaN(d.getTime()) ? 'notime' : d.toISOString().slice(0, 16);
  } else {
    timeKey = 'notime';
  }
  const merchantKey = (merchant || '').replace(/\s+/g, '').toLowerCase();
  const issuerKey = (cardIssuer || '').replace(/\s+/g, '').toLowerCase();
  const raw = `${amount}_${merchantKey}_${timeKey}_${issuerKey}`;

  // 간단한 해시 (djb2 알고리즘)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) + raw.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return `txh_${Math.abs(hash).toString(36)}`;
}

// ---------------------------------------------------------------------------
// 공통 파서 (모든 금융앱 알림에 동일하게 적용)
// ---------------------------------------------------------------------------

function parseGeneric(text: string): Partial<ParsedNotification> {
  return {
    cardIssuer: parseIssuer(text),
    transactionType: parseTransactionType(text),
    incomeOrExpense: parseIncomeOrExpense(text),
    amount: parseAmount(text),
    merchant: parseMerchantGeneric(text),
    dateTime: parseDateTime(text),
    balance: parseBalance(text),
  };
}

// ---------------------------------------------------------------------------
// 외부 API
// ---------------------------------------------------------------------------

export function isBankNotification(packageName: string): boolean {
  return BANK_PACKAGES.includes(packageName) || SMS_PACKAGES.includes(packageName);
}

export function isSmsApp(packageName: string): boolean {
  return SMS_PACKAGES.includes(packageName);
}

export function isBankSms(text: string): boolean {
  const hasAmount = /(\d{1,3}(?:,\d{3})*)\s*원/.test(text);
  const hasBankKeyword = /(승인|결제|출금|입금|이체|사용|잔액|카드)/.test(text);
  if (!hasAmount || !hasBankKeyword) return false;

  // 1. 300자 초과는 무조건 제외 (실제 거래 알림은 절대 300자를 넘지 않음)
  if (text.length > 300) return false;

  // 2. (광고) 태그 제외
  if (/\(광고\)|\[광고\]|광고\)/.test(text)) return false;

  // 3. URL 포함 시 → 거래 구조(잔액 패턴)가 있어야만 허용
  if (/https?:\/\//.test(text)) {
    // 잔액 패턴이 있으면 거래 문자일 가능성 (드물지만 URL 포함 거래 알림 존재)
    const hasBalance = /잔액\s*:?\s*[\d,]+\s*원?/.test(text);
    if (!hasBalance) return false;
  }

  // 4. 마케팅 키워드 + 150자 초과 → 제외
  const hasMarketingKeyword = /(이벤트|추첨|경품|혜택|가입.*ON|응모|당첨|무료|프로모션|안내드립니다|한도|금리|적금|보험료|가입대상)/.test(text);
  if (hasMarketingKeyword && text.length > 150) return false;

  return true;
}

export function parseNotification(rawText: string, packageName: string): ParsedNotification {
  const text = rawText.replace(/[\r\n]+/g, ' ');

  const base: ParsedNotification = {
    cardIssuer: null,
    transactionType: null,
    incomeOrExpense: null,
    amount: null,
    merchant: null,
    dateTime: null,
    balance: null,
    raw: rawText,
    packageName,
  };

  const parsed = parseGeneric(text);
  return {
    ...base,
    ...parsed,
    // cardIssuer 우선순위: 텍스트에서 추출한 값 > 패키지명 브랜드 매핑 > null
    cardIssuer: parsed.cardIssuer || getBrandName(packageName) || null,
  };
}

