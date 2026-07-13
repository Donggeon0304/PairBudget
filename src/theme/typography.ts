/**
 * PairBudget 타이포그래피 스타일
 * React Native StyleSheet 기반 폰트 크기 및 굵기 정의
 */

import { StyleSheet, TextStyle } from 'react-native';
import { Colors } from './colors';

export const Typography = StyleSheet.create({
  // Headings
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.Text,
    letterSpacing: -0.5,
  } as TextStyle,

  h2: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.Text,
    letterSpacing: -0.3,
  } as TextStyle,

  h3: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.Text,
  } as TextStyle,

  h4: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.Text,
  } as TextStyle,

  // Body
  body: {
    fontSize: 16,
    fontWeight: '400',
    color: Colors.Text,
    lineHeight: 24,
  } as TextStyle,

  bodyMedium: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.Text,
    lineHeight: 24,
  } as TextStyle,

  bodyBold: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.Text,
    lineHeight: 24,
  } as TextStyle,

  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.TextSecondary,
    lineHeight: 20,
  } as TextStyle,

  bodySmallMedium: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.TextSecondary,
    lineHeight: 20,
  } as TextStyle,

  // Caption & Label
  caption: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.TextMuted,
    lineHeight: 16,
  } as TextStyle,

  captionMedium: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.TextMuted,
    lineHeight: 16,
  } as TextStyle,

  label: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.TextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,

  // Special: Currency display
  amount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.Text,
    letterSpacing: -0.5,
  } as TextStyle,

  amountSmall: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.Text,
  } as TextStyle,
});
