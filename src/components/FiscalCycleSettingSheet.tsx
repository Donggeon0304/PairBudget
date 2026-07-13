/**
 * FiscalCycleSettingSheet - 기간 설정 바텀시트
 * 기본(1일~말일) vs 커스텀 시작일 선택
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../theme/colors';
import { Spacing, BorderRadius } from '../theme/spacing';
import { useFiscalCycle } from '../contexts/FiscalCycleContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const FiscalCycleSettingSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { enabled, startDay, setFiscalCycle } = useFiscalCycle();
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const [localStartDay, setLocalStartDay] = useState(startDay);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setLocalEnabled(enabled);
      setLocalStartDay(startDay);
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, enabled, startDay]);

  const handleSave = () => {
    setFiscalCycle(localEnabled, localStartDay);
    onClose();
  };

  const endDay = localStartDay - 1 || 28;

  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [300, 0],
                }),
              }],
            },
          ]}
        >
          <TouchableOpacity activeOpacity={1}>
            {/* Handle */}
            <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <Icon name="calendar-outline" size={22} color={Colors.Primary} />
              <Text style={styles.headerTitle}>기간 설정</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Icon name="close" size={22} color={Colors.TextMuted} />
              </TouchableOpacity>
            </View>

            {/* Option: 기본 */}
            <TouchableOpacity
              style={[styles.optionCard, !localEnabled && styles.optionCardActive]}
              onPress={() => setLocalEnabled(false)}
              activeOpacity={0.7}
            >
              <View style={[styles.radio, !localEnabled && styles.radioActive]}>
                {!localEnabled && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, !localEnabled && styles.optionTitleActive]}>기본</Text>
                <Text style={styles.optionDesc}>매월 1일 ~ 말일</Text>
              </View>
            </TouchableOpacity>

            {/* Option: 커스텀 */}
            <TouchableOpacity
              style={[styles.optionCard, localEnabled && styles.optionCardActive]}
              onPress={() => setLocalEnabled(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.radio, localEnabled && styles.radioActive]}>
                {localEnabled && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, localEnabled && styles.optionTitleActive]}>커스텀 시작일</Text>
                <Text style={styles.optionDesc}>원하는 날짜부터 한 달 기준</Text>
              </View>
            </TouchableOpacity>

            {/* Day picker (only when custom enabled) */}
            {localEnabled && (
              <View style={styles.dayPickerSection}>
                <Text style={styles.dayPickerLabel}>시작일 선택</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayPickerScroll}
                >
                  {days.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dayChip, localStartDay === d && styles.dayChipActive]}
                      onPress={() => setLocalStartDay(d)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayChipText, localStartDay === d && styles.dayChipTextActive]}>
                        {d}일
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.previewBox}>
                  <Icon name="information-circle-outline" size={16} color={Colors.Primary} />
                  <Text style={styles.previewText}>
                    매월 {localStartDay}일 ~ 익월 {endDay}일 기준으로{'\n'}데이터를 조회합니다
                  </Text>
                </View>
              </View>
            )}

            {/* Save button */}
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>저장</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.Card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl + 16,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.Divider,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
    flex: 1,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.CardBorder,
    marginBottom: Spacing.sm,
  },
  optionCardActive: {
    borderColor: Colors.Primary,
    backgroundColor: Colors.Primary + '08',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.Divider,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: {
    borderColor: Colors.Primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.Primary,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.Text,
  },
  optionTitleActive: {
    color: Colors.Primary,
  },
  optionDesc: {
    fontSize: 12,
    color: Colors.TextMuted,
    marginTop: 2,
  },
  dayPickerSection: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dayPickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.TextSecondary,
    marginBottom: Spacing.sm,
  },
  dayPickerScroll: {
    paddingBottom: Spacing.sm,
    gap: 6,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.Surface,
    borderWidth: 1,
    borderColor: Colors.CardBorder,
  },
  dayChipActive: {
    backgroundColor: Colors.Primary,
    borderColor: Colors.Primary,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.TextSecondary,
  },
  dayChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.Primary + '08',
    borderRadius: BorderRadius.sm,
  },
  previewText: {
    flex: 1,
    fontSize: 12,
    color: Colors.TextSecondary,
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: Colors.Primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default FiscalCycleSettingSheet;
