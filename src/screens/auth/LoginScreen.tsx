/**
 * PairBudget 로그인 화면
 * 프리미엄 다크 테마 기반 인증 워크플로우
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
import { useAlert } from '../../components/CustomAlert';

/** Firebase Auth 에러 코드 → 한국어 메시지 */
const getAuthErrorMessage = (error: any): string => {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return '아이디 형식이 올바르지 않습니다.';
    case 'auth/user-not-found':
      return '존재하지 않는 아이디입니다.';
    case 'auth/wrong-password':
      return '비밀번호가 틀렸습니다.';
    case 'auth/invalid-credential':
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/too-many-requests':
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
    case 'auth/user-disabled':
      return '비활성화된 계정입니다.';
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인해주세요.';
    default:
      return error?.message || '로그인에 실패했습니다.';
  }
};

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { showAlert } = useAlert();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, loginWithGoogle } = useAuth();

  // Animated values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert({ title: '입력 오류', message: '아이디와 비밀번호를 입력해주세요.', icon: 'warning' });
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const fakeEmail = `${email.trim().toLowerCase()}@pairbudget.com`;
      await login(fakeEmail, password);
    } catch (err: any) {
      const msg = getAuthErrorMessage(err);
      setError(msg);
      showAlert({ title: '로그인 실패', message: msg, icon: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      const msg = err.message || 'Google 로그인에 실패했습니다';
      setError(msg);
      showAlert({ title: '로그인 실패', message: msg, icon: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigateToRegister = () => {
    console.log('[LoginScreen] 회원가입 화면으로 이동');
    navigation.navigate('Register');
  };

  const animateButtonPress = () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.96,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

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
          {/* Logo & Branding */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <View style={styles.logoIconWrapper}>
              <Icon name="wallet-outline" size={40} color={Colors.Primary} />
            </View>
            <Text style={styles.appName}>모두의 가계부</Text>
            <Text style={styles.appSubtitle}>공동 가계부</Text>
            <View style={styles.brandDivider}>
              <View style={styles.brandDividerLine} />
              <View style={styles.brandDividerDot} />
              <View style={styles.brandDividerLine} />
            </View>
          </Animated.View>

          {/* Form */}
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Error Message */}
            {error ? (
              <View style={styles.errorContainer}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Icon name="warning-outline" size={16} color={Colors.Danger} style={{marginRight: 6}} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </View>
            ) : null}

            {/* ID Input */}
            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <Icon name="person-outline" size={20} color={Colors.TextSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="아이디"
                  placeholderTextColor={Colors.TextMuted}
                  value={email}
                  onChangeText={(text) => { setEmail(text); setError(''); }}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <Icon name="lock-closed-outline" size={20} color={Colors.TextSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="비밀번호"
                  placeholderTextColor={Colors.TextMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.showPasswordButton}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={Colors.TextMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Login Button */}
            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={styles.loginButton}
                onPress={() => {
                  animateButtonPress();
                  handleLogin();
                }}
                activeOpacity={0.85}
                disabled={isLoading}
              >
                <View style={[styles.loginButtonGradient, isLoading && {opacity: 0.7}]}>
                  <Text style={styles.loginButtonText}>{isLoading ? '로그인 중...' : '로그인'}</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Divider */}
            <View style={styles.orDivider}>
              <View style={styles.orDividerLine} />
              <Text style={styles.orDividerText}>또는</Text>
              <View style={styles.orDividerLine} />
            </View>

            {/* Google Login Button */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              activeOpacity={0.7}
            >
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Google로 로그인</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Register Link */}
          <Animated.View style={[styles.bottomLink, { opacity: fadeAnim }]}>
            <Text style={styles.bottomLinkText}>계정이 없으신가요? </Text>
            <TouchableOpacity onPress={handleNavigateToRegister}>
              <Text style={styles.bottomLinkAction}>회원가입</Text>
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
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.Primary,
    letterSpacing: -1,
    marginBottom: Spacing.xs,
  },
  appSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.Accent,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  brandDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  brandDividerLine: {
    width: 40,
    height: 1,
    backgroundColor: Colors.CardBorder,
  },
  brandDividerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.Primary,
    marginHorizontal: Spacing.sm,
  },

  // Form
  formContainer: {
    marginBottom: Spacing.xl,
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
  passwordInput: {
    paddingRight: Spacing.xl,
  },
  showPasswordButton: {
    position: 'absolute',
    right: Spacing.md,
    padding: Spacing.xs,
  },

  // Error
  errorContainer: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: Colors.Danger,
  },

  // Login Button
  loginButton: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  loginButtonGradient: {
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
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Divider
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.Divider,
  },
  orDividerText: {
    ...Typography.caption,
    marginHorizontal: Spacing.md,
    color: Colors.TextMuted,
  },

  // Google Button
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.Text,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.Text,
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

export default LoginScreen;
