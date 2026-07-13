/**
 * PairBudget 색상 팔레트
 * Toss/KakaoBank 스타일 미니멀 프리미엄 컬러 시스템
 */

export const Colors = {
  // Brand
  Primary: '#2ECC71',
  PrimaryLight: '#A8E6CF',
  Secondary: '#27AE60',
  Accent: '#F39C12',

  // Transaction
  Income: '#448AFF',
  Expense: '#FF5252',

  // Backgrounds
  Background: '#F7F8FA',
  Surface: '#FFFFFF',
  Card: '#FFFFFF',
  CardBorder: '#F2F4F6',

  // Text
  Text: '#1A1A2E',
  TextSecondary: '#8B95A1',
  TextMuted: '#B0B8C1',

  // Divider
  Divider: '#F2F4F6',

  // Status
  Success: '#2ECC71',
  Warning: '#F39C12',
  Danger: '#FF5252',
} as const;

export type ColorKey = keyof typeof Colors;
