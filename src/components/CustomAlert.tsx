/**
 * CustomAlert - PairBudget 프리미엄 커스텀 Alert
 * 네이티브 Alert.alert() 대체
 * Context 기반으로 앱 어디서나 useAlert() 호출 가능
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../theme/colors';
import { BorderRadius, Spacing } from '../theme/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

type AlertIconType = 'success' | 'error' | 'warning' | 'info' | 'confirm' | 'delete';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertOptions {
  title: string;
  message?: string;
  icon?: AlertIconType;
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = (): AlertContextType => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within a CustomAlertProvider');
  }
  return context;
};

// ─── Icon config ─────────────────────────────────────────────────────────────

const ICON_CONFIG: Record<AlertIconType, { name: string; color: string; bg: string }> = {
  success: { name: 'checkmark-circle', color: Colors.Primary, bg: Colors.Primary + '15' },
  error: { name: 'alert-circle', color: Colors.Danger, bg: Colors.Danger + '15' },
  warning: { name: 'warning', color: Colors.Warning, bg: Colors.Warning + '15' },
  info: { name: 'information-circle', color: Colors.Income, bg: Colors.Income + '15' },
  confirm: { name: 'help-circle', color: Colors.Income, bg: Colors.Income + '15' },
  delete: { name: 'trash', color: Colors.Danger, bg: Colors.Danger + '15' },
};

// ─── Provider ────────────────────────────────────────────────────────────────

export const CustomAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [alertOptions, setAlertOptions] = useState<AlertOptions | null>(null);

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback((options: AlertOptions) => {
    setAlertOptions(options);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = useCallback((onPress?: () => void) => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setAlertOptions(null);
      // 연속 alert 호출 시 React 배치 업데이트 충돌 방지
      if (onPress) {
        setTimeout(onPress, 100);
      }
    });
  }, []);

  const buttons = alertOptions?.buttons || [{ text: '확인', style: 'default' as const }];
  const iconType = alertOptions?.icon;
  const iconConfig = iconType ? ICON_CONFIG[iconType] : null;

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => handleClose()}
      >
        <TouchableWithoutFeedback onPress={() => {
          // 버튼이 cancel만 있으면 배경 탭으로 닫기 가능
          const cancelBtn = buttons.find(b => b.style === 'cancel');
          if (cancelBtn) {
            handleClose(cancelBtn.onPress);
          }
        }}>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.alertContainer,
                  {
                    opacity: opacityAnim,
                    transform: [{ scale: scaleAnim }],
                  },
                ]}
              >
                {/* Icon */}
                {iconConfig && (
                  <View style={[styles.iconCircle, { backgroundColor: iconConfig.bg }]}>
                    <Icon name={iconConfig.name} size={32} color={iconConfig.color} />
                  </View>
                )}

                {/* Title */}
                <Text style={styles.alertTitle}>{alertOptions?.title}</Text>

                {/* Message */}
                {alertOptions?.message ? (
                  <Text style={styles.alertMessage}>{alertOptions.message}</Text>
                ) : null}

                {/* Buttons */}
                <View style={[
                  styles.buttonContainer,
                  buttons.length === 1 && styles.buttonContainerSingle,
                ]}>
                  {buttons.map((btn, index) => {
                    const isDestructive = btn.style === 'destructive';
                    const isCancel = btn.style === 'cancel';

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.button,
                          { flex: 1 },
                          isCancel && styles.buttonCancel,
                          isDestructive && styles.buttonDestructive,
                          !isCancel && !isDestructive && styles.buttonDefault,
                        ]}
                        onPress={() => handleClose(btn.onPress)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            isCancel && styles.buttonTextCancel,
                            isDestructive && styles.buttonTextDestructive,
                            !isCancel && !isDestructive && styles.buttonTextDefault,
                          ]}
                        >
                          {btn.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  alertContainer: {
    width: SCREEN_WIDTH - Spacing.xl * 2,
    maxWidth: 340,
    backgroundColor: Colors.Surface,
    borderRadius: BorderRadius.lg + 4,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
    textAlign: 'center',
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 14,
    color: Colors.TextSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  buttonContainerSingle: {
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDefault: {
    backgroundColor: Colors.Primary,
  },
  buttonCancel: {
    backgroundColor: Colors.CardBorder,
  },
  buttonDestructive: {
    backgroundColor: Colors.Danger,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  buttonTextDefault: {
    color: '#FFFFFF',
  },
  buttonTextCancel: {
    color: Colors.TextSecondary,
  },
  buttonTextDestructive: {
    color: '#FFFFFF',
  },
});
