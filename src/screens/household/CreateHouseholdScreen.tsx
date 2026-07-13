/**
 * PairBudget 가계부 만들기 화면
 * 공유 가계부 생성 및 초대 코드 발급 워크플로우
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
  Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { GlassCard } from '../../components/GlassCard';
import { Colors } from '../../theme/colors';
import { Typography } from '../../theme/typography';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { useHousehold } from '../../contexts/HouseholdContext';

interface CreateHouseholdScreenProps {
  navigation: any;
}

const CreateHouseholdScreen: React.FC<CreateHouseholdScreenProps> = ({
  navigation,
}) => {
  const [householdName, setHouseholdName] = useState('우리 가계부');
  const [isCreated, setIsCreated] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { createHousehold } = useHousehold();

  // Animated values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Invite code reveal animation
  const codeFade = useRef(new Animated.Value(0)).current;
  const codeScale = useRef(new Animated.Value(0.8)).current;
  const codeSlide = useRef(new Animated.Value(40)).current;

  // Pulse animation for code
  const codePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
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
  }, []);

  const startCodePulseAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(codePulse, {
          toValue: 1.03,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(codePulse, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [codePulse]);

  const generateInviteCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreate = async () => {
    if (householdName.trim().length === 0) return;
    setIsLoading(true);
    try {
      const code = await createHousehold(householdName.trim());
      setInviteCode(code);
      setIsCreated(true);

      // Animate invite code card in
      Animated.parallel([
        Animated.timing(codeFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(codeScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(codeSlide, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        startCodePulseAnimation();
      });
    } catch (error: any) {
      console.error('Create household error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    Clipboard.setString(inviteCode);
    setIsCopied(true);
    console.log('[CreateHouseholdScreen] 초대 코드 복사:', inviteCode);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSkip = () => {
    // Already created and user profile updated via context
    // Navigation will happen automatically via AppNavigator checking hasHousehold
  };

  const handleNavigateToJoin = () => {
    console.log('[CreateHouseholdScreen] 참여 화면으로 이동');
    navigation.navigate('JoinHousehold');
  };

  const renderCreateForm = () => (
    <Animated.View
      style={[
        styles.formContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Household Name Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>가계부 이름</Text>
        <View style={styles.inputWrapper}>
          <Icon name="home-outline" size={20} color={Colors.TextSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="우리 가계부"
            placeholderTextColor={Colors.TextMuted}
            value={householdName}
            onChangeText={setHouseholdName}
            autoCapitalize="none"
            maxLength={20}
          />
        </View>
        <Text style={styles.charCount}>{householdName.length}/20</Text>
      </View>

      {/* Create Button */}
      <TouchableOpacity
        style={[
          styles.createButton,
          householdName.trim().length === 0 && styles.createButtonDisabled,
          isLoading && { opacity: 0.7 }
        ]}
        onPress={handleCreate}
        activeOpacity={0.85}
        disabled={householdName.trim().length === 0 || isLoading}
      >
        <Text style={styles.createButtonText}>{isLoading ? '만드는 중...' : '만들기'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderInviteCode = () => (
    <Animated.View
      style={[
        styles.inviteContainer,
        {
          opacity: codeFade,
          transform: [
            { translateY: codeSlide },
            { scale: codeScale },
          ],
        },
      ]}
    >
      <GlassCard style={styles.inviteCard}>
        {/* Success Icon */}
        <View style={styles.successIcon}>
          <Icon name="sparkles-outline" size={28} color={Colors.Primary} />
        </View>

        <Text style={styles.inviteTitle}>가계부가 만들어졌어요!</Text>
        <Text style={styles.inviteSubtitle}>
          아래 코드를 상대방에게 공유해주세요
        </Text>

        {/* Invite Code Display */}
        <Animated.View
          style={[
            styles.codeContainer,
            { transform: [{ scale: codePulse }] },
          ]}
        >
          <View style={styles.codeBox}>
            {inviteCode.split('').map((char, index) => (
              <View key={index} style={styles.codeCharBox}>
                <Text style={styles.codeChar}>{char}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Copy Button */}
        <TouchableOpacity
          style={[
            styles.copyButton,
            isCopied && styles.copyButtonCopied,
          ]}
          onPress={handleCopyCode}
          activeOpacity={0.7}
        >
          <Icon 
            name={isCopied ? 'checkmark-outline' : 'copy-outline'} 
            size={18} 
            color={isCopied ? Colors.Secondary : Colors.TextSecondary} 
          />
          <Text
            style={[
              styles.copyButtonText,
              isCopied && styles.copyButtonTextCopied,
            ]}
          >
            {isCopied ? '복사됨' : '코드 복사'}
          </Text>
        </TouchableOpacity>
      </GlassCard>

      {/* Skip Button */}
      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <Text style={styles.skipButtonText}>나중에 초대하기</Text>
      </TouchableOpacity>
    </Animated.View>
  );

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
        <View style={styles.headerIcon}>
          {isCreated ? (
            <Icon name="sparkles" size={32} color={Colors.Primary} />
          ) : (
            <Icon name="home" size={32} color={Colors.Primary} />
          )}
        </View>
        <Text style={styles.title}>
          {isCreated ? householdName : '가계부 만들기'}
        </Text>
        <Text style={styles.subtitle}>
          {isCreated
            ? '초대 코드로 상대방을 초대해보세요'
            : '새로운 공유 가계부를 만들어보세요'}
        </Text>
      </Animated.View>

      {/* Content */}
      {isCreated ? renderInviteCode() : renderCreateForm()}

      {/* Join Link */}
      {!isCreated && (
        <Animated.View style={[styles.bottomLink, { opacity: fadeAnim }]}>
          <Text style={styles.bottomLinkText}>
            이미 초대 코드가 있으신가요?{' '}
          </Text>
          <TouchableOpacity onPress={handleNavigateToJoin}>
            <Text style={styles.bottomLinkAction}>참여하기</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.Background,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl + Spacing.xl,
  },

  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
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
  },

  // Form
  formContainer: {
    marginTop: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Typography.bodySmallMedium,
    color: Colors.Text,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingHorizontal: Spacing.md,
    height: 56,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.Text,
    paddingVertical: 0,
  },
  charCount: {
    ...Typography.caption,
    textAlign: 'right',
    marginTop: Spacing.xs,
    marginRight: Spacing.xs,
    color: Colors.TextMuted,
  },

  // Create Button
  createButton: {
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
  createButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Invite Code
  inviteContainer: {
    flex: 1,
  },
  inviteCard: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  inviteTitle: {
    ...Typography.h3,
    color: Colors.Text,
    marginBottom: Spacing.sm,
  },
  inviteSubtitle: {
    ...Typography.bodySmall,
    color: Colors.TextSecondary,
    marginBottom: Spacing.lg,
  },

  // Code Display
  codeContainer: {
    marginBottom: Spacing.lg,
  },
  codeBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  codeCharBox: {
    width: 44,
    height: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.Background,
    borderWidth: 1.5,
    borderColor: Colors.Primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeChar: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.Primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Copy Button
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  copyButtonCopied: {
    borderColor: Colors.Secondary,
    backgroundColor: 'rgba(39, 174, 96, 0.1)',
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.Text,
  },
  copyButtonTextCopied: {
    color: Colors.Secondary,
  },

  // Skip Button
  skipButton: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  skipButtonText: {
    ...Typography.bodySmall,
    color: Colors.TextMuted,
    textDecorationLine: 'underline',
  },

  // Bottom Link
  bottomLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  bottomLinkText: {
    ...Typography.bodySmall,
    color: Colors.TextMuted,
  },
  bottomLinkAction: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.Primary,
  },
});

export default CreateHouseholdScreen;
