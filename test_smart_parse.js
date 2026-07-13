var text = '카카오뱅크 입금 1원 명동건 → 입출금통장(1893)';
var cleaned = text.replace(/[\r\n]+/g, ' ');
// 1. 금액 제거
cleaned = cleaned.replace(/\d{1,3}(?:,\d{3})*\s*원/g, '');
// 2. 계좌번호 패턴, 괄호 등 제거
cleaned = cleaned.replace(/[\d\-\*]{10,}/g, '');
cleaned = cleaned.replace(/\(\d{3,6}\)/g, '');
// 3. 은행명 및 쓸모없는 단어 제거
var tokens = ['카카오뱅크', '농협', '입금', '출금', '입출금통장', '입출금', '알림', '잔액'];
tokens.forEach(function (t) {
    cleaned = cleaned.replace(new RegExp(t, 'g'), ' ');
});
// 4. 특수기호 전부 제거 (영문, 숫자, 한글, 공백 제외)
cleaned = cleaned.replace(/[^\w\s가-힣]/g, ' ');
// 5. 공백 정리
cleaned = cleaned.replace(/\s+/g, ' ').trim();
// 6. 숫자만 있는 단어 제거
var words = cleaned.split(' ').filter(function (w) { return !/^\d+$/.test(w); });
var finalMerchant = words.join(' ').substring(0, 20);
console.log(finalMerchant);
