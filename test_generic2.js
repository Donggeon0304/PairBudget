function parseGeneric(rawText) {
    var cleaned = rawText.replace(/[\r\n]+/g, ' ');
    cleaned = cleaned.replace(/잔액\s*[\d,]+원/g, '');
    cleaned = cleaned.replace(/누적\s*[\d,]+원/g, '');
    cleaned = cleaned.replace(/[\d,]+원/g, '');
    cleaned = cleaned.replace(/[\d\-\*]{10,}/g, '');
    cleaned = cleaned.replace(/\(\d{3,6}\)/g, '');
    cleaned = cleaned.replace(/\d{2}\/\d{2}\s?\d{2}:\d{2}/g, '');
    var tokens = [
        '카카오뱅크', '농협', '신한', '국민', '우리', '하나', '토스뱅크', '토스',
        '입금', '출금', '결제', '승인', '취소', '거절', '체크', '신용',
        '입출금통장', '입출금', '통장', '알림', '페이', '해외', '가족',
        '잔액', '원'
    ];
    // 길이기 긴 것부터 처리해야 "입출금통장"이 "출금"때문에 "입 통장"이 되는 것을 막을 수 있음
    tokens.sort(function (a, b) { return b.length - a.length; });
    tokens.forEach(function (t) {
        cleaned = cleaned.replace(new RegExp(t, 'g'), ' ');
    });
    cleaned = cleaned.replace(/[^\w\s가-힣]/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    var words = cleaned.split(' ').filter(function (w) { return !/^\d+$/.test(w); });
    return words.join(' ').substring(0, 20);
}
console.log('Kakao:', parseGeneric('카카오뱅크 입금 1원\n명동건 → 입출금통장(1893)'));
console.log('NH:', parseGeneric('입출금 알림 농협 출금 1원\n10/12 14:00\n123-1234-1234-73\n명동건\n잔액 100,000원'));
console.log('Toss:', parseGeneric('토스뱅크 출금 15,000원\n스타벅스 강남점'));
