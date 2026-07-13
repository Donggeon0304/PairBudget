/**
 * PairBudget 회원가입 화면
 * 프리미엄 다크 테마 기반 회원가입 워크플로우
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../../theme/colors';
import { Typography } from '../../theme/typography';
import { Spacing, BorderRadius } from '../../theme/spacing';
import { useAuth } from '../../contexts/AuthContext';

interface RegisterScreenProps {
  navigation: any;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();

  // Animated values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Staggered input animations
  const inputAnims = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0)),
  ).current;
  const inputSlides = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(20)),
  ).current;

  useEffect(() => {
    // Header fade in
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

    // Stagger input fields
    const staggerAnims = inputAnims.map((anim, index) =>
      Animated.parallel([
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          delay: 200 + index * 100,
          useNativeDriver: true,
        }),
        Animated.timing(inputSlides[index], {
          toValue: 0,
          duration: 400,
          delay: 200 + index * 100,
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.parallel(staggerAnims).start();
  }, []);

  const isIdValid = /^[a-zA-Z0-9]{4,20}$/.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isPasswordMatch = password === passwordConfirm && passwordConfirm.length > 0;
  const isFormValid =
    nickname.trim().length > 0 &&
    isIdValid &&
    isPasswordValid &&
    isPasswordMatch;

  const handleRegister = async () => {
    if (!isFormValid) return;
    setIsLoading(true);
    setError('');
    try {
      const fakeEmail = `${email.trim().toLowerCase()}@pairbudget.com`;
      await register(fakeEmail, password, nickname.trim());
    } catch (err: any) {
      setError(err.message || '회원가입에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigateToLogin = () => {
    console.log('[RegisterScreen] 로그인 화면으로 이동');
    navigation.goBack();
  };

  const renderInputField = (
    index: number,
    icon: string,
    placeholder: string,
    value: string,
    onChangeText: (text: string) => void,
    options?: {
      secureTextEntry?: boolean;
      showToggle?: boolean;
      isVisible?: boolean;
      onToggle?: () => void;
      keyboardType?: 'email-address' | 'default';
      hint?: string;
      hintColor?: string;
      autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    },
  ) => (
    <Animated.View
      style={[
        styles.inputGroup,
        {
          opacity: inputAnims[index],
          transform: [{ translateY: inputSlides[index] }],
        },
      ]}
    >
      <View style={styles.inputWrapper}>
        <Icon name={icon} size={20} color={Colors.TextSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, options?.showToggle && styles.inputWithToggle]}
          placeholder={placeholder}
          placeholderTextColor={Colors.TextMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={options?.secureTextEntry && !options?.isVisible}
          keyboardType={options?.keyboardType || 'default'}
          autoCapitalize={options?.autoCapitalize ?? 'none'}
          autoCorrect={false}
        />
        {options?.showToggle && (
          <TouchableOpacity
            style={styles.showPasswordButton}
            onPress={options.onToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name={options.isVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={Colors.TextMuted} />
          </TouchableOpacity>
        )}
      </View>
      {options?.hint && (
        <Text
          style={[
            styles.hintText,
            options.hintColor ? { color: options.hintColor } : null,
          ]}
        >
          {options.hint}
        </Text>
      )}
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.Background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
              onPress={handleNavigateToLogin}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="arrow-back" size={24} color={Colors.Text} />
            </TouchableOpacity>
            <Text style={styles.title}>회원가입</Text>
            <Text style={styles.subtitle}>
              모두의 가계부와 함께 시작해보세요
            </Text>
          </Animated.View>

          {/* Form */}
          <View style={styles.formContainer}>
            {renderInputField(0, 'person-outline', '닉네임', nickname, setNickname, {
              autoCapitalize: 'sentences',
            })}

            {renderInputField(1, 'mail-outline', '아이디', email, setEmail, {
              keyboardType: 'default',
              hint:
                email.length > 0
                  ? isIdValid
                    ? '✓ 사용 가능한 아이디입니다'
                    : '영문/숫자 4~20자'
                  : '영문/숫자 4~20자',
              hintColor:
                email.length > 0
                  ? isIdValid
                    ? Colors.Secondary
                    : Colors.Danger
                  : Colors.TextMuted,
            })}

            {renderInputField(2, 'lock-closed-outline', '비밀번호', password, setPassword, {
              secureTextEntry: true,
              showToggle: true,
              isVisible: showPassword,
              onToggle: () => setShowPassword(!showPassword),
              hint:
                password.length > 0
                  ? isPasswordValid
                    ? '✓ 사용 가능한 비밀번호입니다'
                    : '6자 이상 입력해주세요'
                  : '6자 이상',
              hintColor:
                password.length > 0
                  ? isPasswordValid
                    ? Colors.Secondary
                    : Colors.Danger
                  : Colors.TextMuted,
            })}

            {renderInputField(
              3,
              'lock-open-outline',
              '비밀번호 확인',
              passwordConfirm,
              setPasswordConfirm,
              {
                secureTextEntry: true,
                showToggle: true,
                isVisible: showPasswordConfirm,
                onToggle: () => setShowPasswordConfirm(!showPasswordConfirm),
                hint:
                  passwordConfirm.length > 0
                    ? isPasswordMatch
                      ? '✓ 비밀번호가 일치합니다'
                      : '비밀번호가 일치하지 않습니다'
                    : undefined,
                hintColor:
                  passwordConfirm.length > 0
                    ? isPasswordMatch
                      ? Colors.Secondary
                      : Colors.Danger
                    : undefined,
              },
            )}

            {/* Register Button */}
            <Animated.View
              style={{
                opacity: inputAnims[3],
                transform: [{ translateY: inputSlides[3] }],
              }}
            >
              <TouchableOpacity
                style={[
                  styles.registerButton,
                  (!isFormValid || isLoading) && styles.registerButtonDisabled,
                ]}
                onPress={handleRegister}
                activeOpacity={0.85}
                disabled={!isFormValid || isLoading}
              >
                <Text style={styles.registerButtonText}>{isLoading ? '가입 중...' : '회원가입'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Login Link */}
          <Animated.View style={[styles.bottomLink, { opacity: fadeAnim }]}>
            <Text style={styles.bottomLinkText}>이미 계정이 있으신가요? </Text>
            <TouchableOpacity onPress={handleNavigateToLogin}>
              <Text style={styles.bottomLinkAction}>로그인</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.Background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl + Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // Header
  headerContainer: {
    marginBottom: Spacing.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.TextSecondary,
  },

  // Form
  formContainer: {
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.md,
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
  inputWithToggle: {
    paddingRight: Spacing.xl,
  },
  showPasswordButton: {
    position: 'absolute',
    right: Spacing.md,
    padding: Spacing.xs,
  },
  hintText: {
    ...Typography.caption,
    marginTop: Spacing.xs,
    marginLeft: Spacing.xs,
  },

  // Register Button
  registerButton: {
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
  registerButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  registerButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Bottom Link
  bottomLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
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

export default RegisterScreen;
