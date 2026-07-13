/**
 * PairBudget 날짜 유틸리티
 * 한국어 날짜 포맷 및 월별 계산 헬퍼
 */

/**
 * Date → 'YYYY-MM' 형식 문자열
 * @example getYearMonth(new Date(2026, 5, 1)) → '2026-06'
 */
export const getYearMonth = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Date → 'M월 D일' 형식
 * @example formatDate(new Date(2026, 5, 1)) → '6월 1일'
 */
export const formatDate = (date: Date): string => {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

/**
 * Date → 'M월 D일 HH:MM' 형식
 * @example formatDateTime(new Date(2026, 5, 1, 15, 30)) → '6월 1일 15:30'
 */
export const formatDateTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${hours}:${minutes}`;
};

/**
 * 해당 월의 시작일 (1일 00:00:00.000)
 */
export const getStartOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
};

/**
 * 해당 월의 마지막 날 (마지막일 23:59:59.999)
 */
export const getEndOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

/**
 * 'YYYY-MM' → 'M월' 라벨
 * @example getMonthLabel('2026-06') → '6월'
 */
export const getMonthLabel = (yearMonth: string): string => {
  const month = parseInt(yearMonth.split('-')[1], 10);
  return `${month}월`;
};

/**
 * 해당 월의 일수
 * @example getDaysInMonth(new Date(2026, 5, 1)) → 30
 */
export const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

/**
 * 두 Date가 같은 날인지 비교 (시간 무시)
 */
export const isSameDay = (a: Date, b: Date): boolean => {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

/**
 * 'YYYY-MM' → 'YYYY년 M월' 전체 라벨
 * @example getFullMonthLabel('2026-06') → '2026년 6월'
 */
export const getFullMonthLabel = (yearMonth: string): string => {
  const [year, month] = yearMonth.split('-');
  return `${year}년 ${parseInt(month, 10)}월`;
};

/**
 * 최근 N개월의 Date 배열 반환 (과거 → 현재 순서)
 * @example getLastNMonths(6, new Date(2026, 5, 1)) → [2026-01, 2026-02, ..., 2026-06]
 */
export const getLastNMonths = (n: number, baseDate: Date): Date[] => {
  const months: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    months.push(new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1));
  }
  return months;
};

