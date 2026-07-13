/**
 * PairBudget 통화 포맷 유틸리티
 * 한국 원화(KRW) 표시 형식
 */

/**
 * 숫자를 한국 원화 형식으로 포맷
 * @example formatCurrency(15000) → '15,000원'
 * @example formatCurrency(-3200) → '-3,200원'
 */
export const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('ko-KR') + '원';
};

/**
 * 큰 금액을 축약하여 표시 (만원, 억원 단위)
 * @example formatCompactCurrency(15000) → '1.5만원'
 * @example formatCompactCurrency(150000000) → '1.5억원'
 * @example formatCompactCurrency(3200) → '3,200원'
 */
export const formatCompactCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 100_000_000) {
    // 억 단위
    const value = absAmount / 100_000_000;
    const formatted = value % 1 === 0 ? value.toString() : value.toFixed(1);
    return `${sign}${formatted}억원`;
  }

  if (absAmount >= 10_000) {
    // 만 단위
    const value = absAmount / 10_000;
    const formatted = value % 1 === 0 ? value.toString() : value.toFixed(1);
    return `${sign}${formatted}만원`;
  }

  return formatCurrency(amount);
};

/**
 * 금액에 부호(+/-)를 붙여서 포맷
 * @example formatSignedCurrency(15000) → '+15,000원'
 * @example formatSignedCurrency(-3200) → '-3,200원'
 */
export const formatSignedCurrency = (amount: number): string => {
  const prefix = amount > 0 ? '+' : '';
  return prefix + formatCurrency(amount);
};
