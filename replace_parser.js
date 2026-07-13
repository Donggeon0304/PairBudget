const fs = require('fs');

const path = 'D:/SideProjects/PairBudget/src/services/BankNotificationParser.ts';
let content = fs.readFileSync(path, 'utf8');

const newParseMerchantGeneric = `function parseMerchantGeneric(text: string): string | null {
  const segments = text.split(/[\\r\\n|]|\\s+(?:->|=>|▶|➔|➡|〉|>|→|⇒|⇨|►)\\s+/);
  
  const tokens = [
    '카카오뱅크', '카카오페이', '네이버페이', '토스뱅크', '토스페이', '토스', '농협', '신한', '국민', '우리', '하나', '케이뱅크', '페이코', '삼성페이', '제로페이',
    '입출금통장', '자유입출금', '저축예금', '보통예금', '증권저축', '정기예금',
    '입출금알림', '입출금', '입금', '출금', '결제', '승인', '취소', '거절', '체크', '신용', '해외',
    '통장', '알림', '가족', '잔액', '원', '님',
    'KB국민은행', '신한은행', '우리은행', '삼성카드', '현대카드', 'KB', 'NH', '은행', '카드', '일시불'
  ];
  tokens.sort((a, b) => b.length - a.length);

  const cleanedSegments = segments.map(seg => {
    let c = seg;
    c = c.replace(/잔액\\s*[\\d,]+원?/g, '');
    c = c.replace(/누적\\s*[\\d,]+원?/g, '');
    c = c.replace(/[\\d,]+원/g, '');
    c = c.replace(/[\\d\\-\\*]{10,}/g, '');
    c = c.replace(/\\(\\d{3,6}\\)/g, '');
    c = c.replace(/\\d{4}\\.\\d{2}\\.\\d{2}/g, '');
    c = c.replace(/\\d{2}\\/\\d{2}\\s?\\d{2}:\\d{2}/g, '');
    c = c.replace(/\\d{2}:\\d{2}/g, '');
    
    tokens.forEach(t => {
      c = c.replace(new RegExp(t, 'g'), ' ');
    });

    c = c.replace(/[^\\w\\s가-힣]/g, ' ');
    c = c.replace(/\\s+/g, ' ').trim();
    
    if (/^[\\d\\s]+$/.test(c)) return '';
    return c;
  }).filter(seg => seg.length > 0);

  if (cleanedSegments.length === 0) return null;
  const finalMerchant = cleanedSegments[cleanedSegments.length - 1];
  return finalMerchant.substring(0, 20);
}
`;

// Replace from 'function parseMerchantGeneric(text: string): string | null {' to the end of the function body.
// We'll just find the start of the function and the start of 'function parseKB('
const startIndex = content.indexOf('function parseMerchantGeneric(text: string): string | null {');
const endIndex = content.indexOf('function parseKB(text: string): Partial<ParsedNotification> {');

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newParseMerchantGeneric + '\n' + content.substring(endIndex);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Successfully replaced parseMerchantGeneric');
} else {
  console.log('Failed to find function boundaries');
}
