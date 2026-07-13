/**
 * PairBudget 가계부 참여하기 화면
 * 초대 코드 입력을 통한 가계부 참여 워크플로우
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Platform,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { GlassCard } from '../../components/GlassCard';
import { Colors } from '../../theme/colors';
import { Typography } from '../../theme/typography';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { useHousehold } from '../../contexts/HouseholdContext';

const CODE_LENGTH = 6;

interface JoinHouseholdScreenProps {
  navigation: any;
}

const JoinHouseholdScreen: React.FC<JoinHouseholdScreenProps> = ({
  navigation,
}) => {
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const { joinHousehold } = useHousehold();

  const inputRefs = useRef<(TextInput | null)[]>(
    Array(CODE_LENGTH).fill(null),
  );

  // Animated values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Individual box animations (staggered entrance)
  const boxAnims = useRef(
    Array.from({ length: CODE_LENGTH }, () => new Animated.Value(0)),
  ).current;
  const boxScales = useRef(
    Array.from({ length: CODE_LENGTH }, () => new Animated.Value(0.5)),
  ).current;

  // Button animation
  const buttonFade = useRef(new Animated.Value(0)).current;
  const buttonSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Header animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Stagger box animations
    const boxAnimations = boxAnims.map((anim, index) =>
      Animated.parallel([
        Animated.timing(anim, {
          toValue: 1,
          duration: 300,
          delay: 300 + index * 80,
          useNativeDriver: true,
        }),
        Animated.spring(boxScales[index], {
          toValue: 1,
          friction: 8,
          tension: 60,
          delay: 300 + index * 80,
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.parallel(boxAnimations).start();

    // Button animation
    Animated.parallel([
      Animated.timing(buttonFade, {
        toValue: 1,
        duration: 400,
        delay: 800,
        useNativeDriver: true,
      }),
      Animated.timing(buttonSlide, {
        toValue: 0,
        duration: 400,
        delay: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-focus first input
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 600);
  }, []);

  const isCodeComplete = code.every((c) => c.length > 0);

  const handleCodeChange = useCallback(
    (text: string, index: number) => {
      // Only accept alphanumeric characters
      const cleaned = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      if (cleaned.length === 0) {
        // Character deleted
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
        return;
      }

      if (cleaned.length === 1) {
        // Single character entered
        const newCode = [...code];
        newCode[index] = cleaned;
        setCode(newCode);

        // Auto-advance to next input
        if (index < CODE_LENGTH - 1) {
          inputRefs.current[index + 1]?.focus();
          setFocusedIndex(index + 1);
        }
      } else if (cleaned.length > 1) {
        // Paste: fill from current index
        const newCode = [...code];
        const chars = cleaned.slice(0, CODE_LENGTH - index);
        for (let i = 0; i < chars.length; i++) {
          if (index + i < CODE_LENGTH) {
            newCode[index + i] = chars[i];
          }
        }
        setCode(newCode);

        // Focus last filled or last input
        const nextIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();
        setFocusedIndex(nextIndex);
      }
    },
    [code],
  );

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
      if (e.nativeEvent.key === 'Backspace' && code[index] === '' && index > 0) {
        // Go back to previous input
        const newCode = [...code];
        newCode[index - 1] = '';
        setCode(newCode);
        inputRefs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      }
    },
    [code],
  );

  const handleJoin = async () => {
    if (!isCodeComplete) return;

    setIsJoining(true);
    setError('');
    const fullCode = code.join('');
    try {
      await joinHousehold(fullCode);
      // Navigation happens automatically via AppNavigator
    } catch (err: any) {
      setError(err.message || '참여에 실패했습니다');
    } finally {
      setIsJoining(false);
    }
  };

  const handleNavigateToCreate = () => {
    console.log('[JoinHouseholdScreen] 만들기 화면으로 이동');
    navigation.navigate('CreateHousehold');
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />

      {/* Header */}
      <Animated.View
        style={[
          styles.headerContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-back" size={24} color={Colors.Text} />
        </TouchableOpacity>

        <View style={styles.headerIcon}>
          <Icon name="link" size={32} color={Colors.Primary} />
        </View>
        <Text style={styles.title}>가계부 참여하기</Text>
        <Text style={styles.subtitle}>
          상대방이 공유한 초대 코드를 입력해주세요
        </Text>
      </Animated.View>

      {/* Code Input */}
      <View style={styles.codeSection}>
        {error ? (
          <View style={styles.errorContainer}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Icon name="warning-outline" size={16} color={Colors.Danger} style={{marginRight: 6}} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </View>
        ) : null}

        <GlassCard style={styles.codeCard}>
          <View style={styles.codeInputRow}>
            {Array.from({ length: CODE_LENGTH }).map((_, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.codeInputBox,
                  focusedIndex === index && styles.codeInputBoxFocused,
                  code[index].length > 0 && styles.codeInputBoxFilled,
                  {
                    opacity: boxAnims[index],
                    transform: [{ scale: boxScales[index] }],
                  },
                ]}
              >
                <TextInput
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={styles.codeInput}
                  value={code[index]}
                  onChangeText={(text) => handleCodeChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  onFocus={() => setFocusedIndex(index)}
                  maxLength={index === 0 ? CODE_LENGTH : 1}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  textAlign="center"
                  selectionColor={Colors.Primary}
                />
              </Animated.View>
            ))}
          </View>

          {/* Decorative dots below code */}
          <View style={styles.dotsContainer}>
            {Array.from({ length: CODE_LENGTH }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  code[index].length > 0 && styles.dotFilled,
                ]}
              />
            ))}
          </View>
        </GlassCard>

        {/* Join Button */}
        <Animated.View
          style={{
            opacity: buttonFade,
            transform: [{ translateY: buttonSlide }],
          }}
        >
          <TouchableOpacity
            style={[
              styles.joinButton,
              !isCodeComplete && styles.joinButtonDisabled,
              isJoining && styles.joinButtonLoading,
            ]}
            onPress={handleJoin}
            activeOpacity={0.85}
            disabled={!isCodeComplete || isJoining}
          >
            <Text style={styles.joinButtonText}>
              {isJoining ? '참여 중...' : '참여하기'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Create Link */}
      <Animated.View style={[styles.bottomLink, { opacity: fadeAnim }]}>
        <View style={styles.bottomDivider}>
          <View style={styles.bottomDividerLine} />
          <Text style={styles.bottomDividerText}>또는</Text>
          <View style={styles.bottomDividerLine} />
        </View>
        <TouchableOpacity
          style={styles.createLinkButton}
          onPress={handleNavigateToCreate}
          activeOpacity={0.7}
        >
          <Icon name="sparkles-outline" size={16} color={Colors.Primary} />
          <Text style={styles.createLinkText}>새로 만들기</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.Background,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl + Spacing.lg,
  },

  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  backButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    color: Colors.Text,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.TextSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
  },

  // Code Section
  codeSection: {
    marginTop: Spacing.md,
  },
  errorContainer: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: Colors.Danger,
    fontWeight: '600',
  },
  codeCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  codeInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  codeInputBox: {
    width: 46,
    height: 58,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.Background,
    borderWidth: 1.5,
    borderColor: Colors.CardBorder,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  codeInputBoxFocused: {
    borderColor: Colors.Primary,
    borderWidth: 2,
    shadowColor: Colors.Primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  codeInputBoxFilled: {
    borderColor: Colors.Primary,
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
  },
  codeInput: {
    width: '100%',
    height: '100%',
    fontSize: 22,
    fontWeight: '800',
    color: Colors.Primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    paddingVertical: 0,
  },

  // Dots
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm + 20,
    marginTop: Spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.CardBorder,
  },
  dotFilled: {
    backgroundColor: Colors.Primary,
  },

  // Join Button
  joinButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.Primary,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    shadowColor: Colors.Primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  joinButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  joinButtonLoading: {
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.Primary,
  },
  joinButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Bottom Link
  bottomLink: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Spacing.xxl,
  },
  bottomDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  bottomDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.Divider,
  },
  bottomDividerText: {
    ...Typography.caption,
    color: Colors.TextMuted,
    marginHorizontal: Spacing.md,
  },
  createLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  createLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.Text,
  },
});

export default JoinHouseholdScreen;
