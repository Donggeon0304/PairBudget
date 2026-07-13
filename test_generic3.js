"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGeneric = parseGeneric;
function parseGeneric(rawText) {
    var cleaned = rawText.replace(/[\r\n]+/g, ' ');
    cleaned = cleaned.replace(/잔액\s*[\d,]+원/g, '');
    cleaned = cleaned.replace(/누적\s*[\d,]+원/g, '');
    cleaned = cleaned.replace(/[\d,]+원/g, '');
    cleaned = cleaned.replace(/[\d\-\*]{10,}/g, '');
    cleaned = cleaned.replace(/\(\d{3,6}\)/g, '');
    cleaned = cleaned.replace(/\d{4}\.\d{2}\.\d{2}/g, '');
    cleaned = cleaned.replace(/\d{2}\/\d{2}\s?\d{2}:\d{2}/g, '');
    var tokens = [
        '카카오뱅크', '카카오페이', '네이버페이', '토스뱅크', '토스페이', '토스', '농협', '신한', '국민', '우리', '하나', '케이뱅크', '페이코', '삼성페이', '제로페이',
        '입출금통장', '자유입출금', '저축예금', '보통예금', '증권저축', '정기예금',
        '입출금알림', '입출금', '입금', '출금', '결제', '승인', '취소', '거절', '체크', '신용', '해외',
        '통장', '알림', '가족', '잔액', '원', '님'
    ];
    tokens.sort(function (a, b) { return b.length - a.length; });
    tokens.forEach(function (t) {
        cleaned = cleaned.replace(new RegExp(t, 'g'), ' ');
    });
    // 모든 특수기호 제거 (알파벳, 숫자, 한글, 공백 제외)
    cleaned = cleaned.replace(/[^\w\s가-힣]/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    // 순수 숫자 제거
    var words = cleaned.split(' ').filter(function (w) { return !/^\d+$/.test(w); });
    return words.join(' ').substring(0, 20);
}
var cases = [
    '카카오뱅크 입금 1원\n명동건 → 입출금통장(1893)',
    '입출금 알림 농협 출금 1원\n10/12 14:00\n123-1234-1234-73\n명동건\n잔액 100,000원',
    '토스뱅크 출금 15,000원\n스타벅스 강남점\n잔액 100,000원',
    '[KB국민은행]\n명동건님\n09/01 12:30\n123456-**-***\n출금 10,000원\n스타벅스\n잔액 90,000원',
    '[신한은행]\n입출금알림\n10/12 14:00\n110-***-***\n명동건\n입금 1,000원\n잔액 100,000원',
    '[삼성카드]\n명동건님\n10/12 14:00\n스타벅스\n10,000원 승인\n누적 100,000원',
    '[우리은행]\n명동건님\n10/12 14:00\n1002-***-***\n출금 10,000원\n스타벅스\n잔액 90,000원',
    '현대카드 승인\n명동건님\n10,000원\n일시불\n스타벅스',
];
cases.forEach(function (c, i) {
    console.log("Case ".concat(i + 1, ": ").concat(parseGeneric(c)));
});
