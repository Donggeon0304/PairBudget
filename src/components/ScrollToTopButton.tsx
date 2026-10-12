/**
 * ScrollToTopButton — 스크롤 최상단 이동 FAB (좌하단)
 *
 * 사용법:
 * 1. ScrollView/FlatList에 ref와 onScroll을 연결
 * 2. <ScrollToTopButton scrollY={scrollY} onPress={() => scrollRef.current?.scrollTo({y:0})} />
 */

import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../theme/colors';

interface ScrollToTopButtonProps {
  /** 현재 스크롤 Y 위치 */
  scrollY: number;
  /** 버튼 클릭 시 호출 */
  onPress: () => void;
  /** 버튼이 나타나는 스크롤 임계값 (기본 300) */
  threshold?: number;
  /** 하단 여백 (기본 24, 모달 등에서 네비게이션 바 회피용) */
  bottomOffset?: number;
}

const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  scrollY,
  onPress,
  threshold = 300,
  bottomOffset = 24,
}) => {
  const visible = scrollY > threshold;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : 20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  if (!visible && (opacity as any)._value === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: bottomOffset, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={styles.button}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Icon name="arrow-up" size={20} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    zIndex: 100,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.Primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default ScrollToTopButton;
