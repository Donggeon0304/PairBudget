/**
 * BankNotificationParser 유닛 테스트
 * 
 * 실행: npx jest src/services/__tests__/BankNotificationParser.test.ts
 */

import {parseNotification, isBankNotification, BANK_PACKAGES} from '../BankNotificationParser';

describe('BankNotificationParser', () => {
  describe('isBankNotification', () => {
    it('should recognize NH농협 package', () => {
      expect(isBankNotification('com.nonghyup.banking')).toBe(true);
    });

    it('should recognize KB국민 package', () => {
      expect(isBankNotification('com.kbstar.kbank')).toBe(true);
    });

    it('should recognize 카카오뱅크 package', () => {
      expect(isBankNotification('com.kakaobank.channel')).toBe(true);
    });

    it('should recognize 토스 package', () => {
      expect(isBankNotification('viva.republica.toss')).toBe(true);
    });

    it('should reject non-bank packages', () => {
      expect(isBankNotification('com.kakao.talk')).toBe(false);
      expect(isBankNotification('com.instagram.android')).toBe(false);
    });

    it('should have all expected bank packages', () => {
      expect(BANK_PACKAGES).toContain('com.nonghyup.banking');
      expect(BANK_PACKAGES).toContain('com.kbstar.kbank');
      expect(BANK_PACKAGES).toContain('com.shinhan.sbanking');
      expect(BANK_PACKAGES).toContain('com.wooribank.pib.smart');
      expect(BANK_PACKAGES).toContain('com.hanabank.ebk.channel.android.hananbank');
      expect(BANK_PACKAGES).toContain('com.kakaobank.channel');
      expect(BANK_PACKAGES).toContain('viva.republica.toss');
    });
  });

  describe('parseNotification - NH농협', () => {
    it('should parse standard NH notification', () => {
      const result = parseNotification(
        '[NH농협카드] 승인 15,800원 정상처리 06월 01일 14:30 스타벅스 강남점',
        'com.nonghyup.banking',
      );

      expect(result.cardIssuer).toBe('NH농협카드');
      expect(result.amount).toBe(15800);
      expect(result.transactionType).toBe('approve');
      expect(result.incomeOrExpense).toBe('expense');
      expect(result.merchant).toContain('스타벅스');
      expect(result.dateTime).toBeTruthy();
      expect(result.packageName).toBe('com.nonghyup.banking');
    });

    it('should parse NH notification with balance', () => {
      const result = parseNotification(
        '[NH농협카드] 승인 32,000원 정상처리 06월 01일 12:15 배달의민족 잔액 250,300원',
        'com.nonghyup.banking',
      );

      expect(result.amount).toBe(32000);
      expect(result.balance).toBe(250300);
      expect(result.merchant).toContain('배달의민족');
    });

    it('should detect cancellation', () => {
      const result = parseNotification(
        '[NH농협카드] 승인취소 15,800원 06월 01일 14:35 스타벅스 강남점',
        'com.nonghyup.banking',
      );

      expect(result.transactionType).toBe('cancel');
      expect(result.incomeOrExpense).toBe('expense');
      expect(result.amount).toBe(15800);
    });
  });

  describe('parseNotification - KB국민', () => {
    it('should parse KB notification', () => {
      const result = parseNotification(
        '[KB국민카드] 12,340원 승인 05/01 14:30 (주)스타벅스 잔액 50,000원',
        'com.kbstar.kbank',
      );

      expect(result.cardIssuer).toBe('KB국민카드');
      expect(result.amount).toBe(12340);
      expect(result.transactionType).toBe('approve');
      expect(result.balance).toBe(50000);
    });
  });

  describe('parseNotification - 신한', () => {
    it('should parse 신한 notification', () => {
      const result = parseNotification(
        '[신한카드] 12,340원 승인 05/01 14:30 (주)쿠팡',
        'com.shinhan.sbanking',
      );

      expect(result.cardIssuer).toBe('신한카드');
      expect(result.amount).toBe(12340);
      expect(result.transactionType).toBe('approve');
    });
  });

  describe('parseNotification - 카카오뱅크', () => {
    it('should parse 카카오뱅크 notification', () => {
      const result = parseNotification(
        '카카오뱅크 스타벅스 5,500원 결제 승인',
        'com.kakaobank.channel',
      );

      expect(result.amount).toBe(5500);
      expect(result.transactionType).toBe('approve');
    });
  });

  describe('parseNotification - edge cases', () => {
    it('should handle amount with no spaces before 원', () => {
      const result = parseNotification(
        '[NH농협카드] 승인 1,000원 정상처리 06월 01일 09:00 테스트',
        'com.nonghyup.banking',
      );

      expect(result.amount).toBe(1000);
    });

    it('should handle large amounts', () => {
      const result = parseNotification(
        '[KB국민카드] 1,234,567원 승인 05/01 14:30 대형마트',
        'com.kbstar.kbank',
      );

      expect(result.amount).toBe(1234567);
    });

    it('should preserve raw message', () => {
      const raw = '[NH농협카드] 승인 5,000원 정상처리 06월 01일 10:00 편의점';
      const result = parseNotification(raw, 'com.nonghyup.banking');

      expect(result.raw).toBe(raw);
    });

    it('should handle unparseable message gracefully', () => {
      const result = parseNotification(
        '서비스 점검 안내: 06월 01일 02:00~04:00',
        'com.nonghyup.banking',
      );

      expect(result.amount).toBeNull();
      expect(result.transactionType).toBeNull();
    });
  });

  describe('parseNotification - 실제 알림 예시', () => {
    it('NH농협 입금 알림을 파싱해야 한다', () => {
      const result = parseNotification(
        'NH농협 알림 농협 입금1원 06/02 14:33 356-****-0555-73 명동건 잔액723,323원',
        'com.nonghyup.banking',
      );

      expect(result.transactionType).toBe('approve');
      expect(result.incomeOrExpense).toBe('income');
      expect(result.amount).toBe(1);
      expect(result.balance).toBe(723323);
    });

    it('출금 알림을 파싱해야 한다', () => {
      const result = parseNotification(
        '출금 1원 입출금통장(1893) → 명동건',
        'com.nonghyup.banking',
      );

      expect(result.transactionType).toBe('approve');
      expect(result.incomeOrExpense).toBe('expense');
      expect(result.amount).toBe(1);
    });

    it('KB국민카드 승인 알림을 파싱해야 한다', () => {
      const result = parseNotification(
        '[KB국민카드] 승인 50,000원 스타벅스',
        'com.kbstar.kbank',
      );

      expect(result.transactionType).toBe('approve');
      expect(result.incomeOrExpense).toBe('expense');
      expect(result.amount).toBe(50000);
      expect(result.cardIssuer).toBe('KB국민카드');
    });

    it('이체 알림을 expense로 파싱해야 한다', () => {
      const result = parseNotification(
        '이체 100,000원 홍길동',
        'com.nonghyup.banking',
      );

      expect(result.transactionType).toBe('approve');
      expect(result.incomeOrExpense).toBe('expense');
      expect(result.amount).toBe(100000);
    });

    it('입금완료 알림을 income으로 파싱해야 한다', () => {
      const result = parseNotification(
        '입금완료 500,000원 잔액1,200,000원',
        'com.nonghyup.banking',
      );

      expect(result.transactionType).toBe('approve');
      expect(result.incomeOrExpense).toBe('income');
      expect(result.amount).toBe(500000);
    });

    it('가맹점명에 "수입"이 포함된 출금을 expense로 파싱해야 한다', () => {
      const result = parseNotification(
        '입출금 알림 농협 출금9,000원 06/23 20:57 356-****-0555-73 세외수입_KIC 잔액47,502원',
        'com.nonghyup.banking',
      );

      expect(result.incomeOrExpense).toBe('expense');
      expect(result.amount).toBe(9000);
      expect(result.balance).toBe(47502);
    });
  });
});
