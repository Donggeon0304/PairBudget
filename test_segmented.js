function parseSegmented(rawText) {
    // 1. 구분자(줄바꿈, 화살표, 파이프 등)를 기준으로 텍스트를 나눔
    var segments = rawText.split(/[\r\n|:]|(?:->|=>|▶|➔|➡|〉|>|→|⇒|⇨|►)/);
    var tokens = [
        '카카오뱅크', '카카오페이', '네이버페이', '토스뱅크', '토스페이', '토스', '농협', '신한', '국민', '우리', '하나', '케이뱅크', '페이코', '삼성페이', '제로페이',
        '입출금통장', '자유입출금', '저축예금', '보통예금', '증권저축', '정기예금',
        '입출금알림', '입출금', '입금', '출금', '결제', '승인', '취소', '거절', '체크', '신용', '해외',
        '통장', '알림', '가족', '잔액', '원', '님',
        'KB국민은행', '신한은행', '우리은행', '삼성카드', '현대카드', 'KB', 'NH', '은행', '카드', '일시불'
    ];
    tokens.sort(function (a, b) { return b.length - a.length; });
    var cleanedSegments = segments.map(function (seg) {
        var c = seg;
        c = c.replace(/잔액\s*[\d,]+원?/g, '');
        c = c.replace(/누적\s*[\d,]+원?/g, '');
        c = c.replace(/[\d,]+원/g, '');
        c = c.replace(/[\d\-\*]{10,}/g, '');
        c = c.replace(/\(\d{3,6}\)/g, '');
        c = c.replace(/\d{4}\.\d{2}\.\d{2}/g, '');
        c = c.replace(/\d{2}\/\d{2}\s?\d{2}:\d{2}/g, '');
        tokens.forEach(function (t) {
            c = c.replace(new RegExp(t, 'g'), ' ');
        });
        c = c.replace(/[^\w\s가-힣]/g, ' ');
        c = c.replace(/\s+/g, ' ').trim();
        // 숫자만 있는 경우 빈 문자열로
        if (/^\d+$/.test(c))
            return '';
        return c;
    }).filter(function (seg) { return seg.length > 0; });
    // 남은 세그먼트 중 가장 유력한 가맹점 찾기
    // 보통 결제처/송금자는 배열의 끝부분에 위치하거나, 유일하게 남은 텍스트임
    return cleanedSegments;
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
    console.log("Case ".concat(i + 1, ":"), parseSegmented(c));
});
