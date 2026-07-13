/**
 * CategorySelectModal - 좌 대메뉴 | 우 소메뉴 분할 레이아웃
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../theme/colors';
import { Spacing, BorderRadius } from '../theme/spacing';
import { Category } from '../types';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const LEFT_W = 90;

// 대메뉴별 대표 아이콘
const GROUP_ICONS: Record<string, string> = {
  '식비': 'restaurant-outline',
  '교통': 'bus-outline',
  '쇼핑': 'bag-outline',
  '주거/생활': 'home-outline',
  '문화/여가': 'film-outline',
  '의료/건강': 'medical-outline',
  '교육': 'school-outline',
  '경조사': 'heart-outline',
  '금융': 'shield-checkmark-outline',
  '반려동물': 'paw-outline',
  '기타': 'ellipsis-horizontal-outline',
  '급여': 'wallet-outline',
  '부수입': 'gift-outline',
  '기타수입': 'add-circle-outline',
};

// 대메뉴별 대표 색상
const GROUP_COLORS: Record<string, string> = {
  '식비': '#FF6B6B',
  '교통': '#74B9FF',
  '쇼핑': '#FD79A8',
  '주거/생활': '#00CEC9',
  '문화/여가': '#A29BFE',
  '의료/건강': '#55EFC4',
  '교육': '#81ECEC',
  '경조사': '#F8A5C2',
  '금융': '#636E72',
  '반려동물': '#FDCB6E',
  '기타': '#B2BEC3',
  '급여': '#00B894',
  '부수입': '#74B9FF',
  '기타수입': '#55EFC4',
};

interface CategorySelectModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (category: Category) => void;
  categories: Category[];
  selectedId?: string;
  type?: 'expense' | 'income';
}

const CategorySelectModal: React.FC<CategorySelectModalProps> = ({
  visible,
  onClose,
  onSelect,
  categories,
  selectedId,
  type,
}) => {
  const [activeGroup, setActiveGroup] = useState<string>('');

  const { groups, groupMap } = useMemo(() => {
    const filtered = type
      ? categories.filter(c => c.type === type)
      : categories;

    const map = new Map<string, Category[]>();
    filtered.forEach(cat => {
      const group = cat.group || cat.name;
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(cat);
    });

    return {
      groups: Array.from(map.keys()),
      groupMap: map,
    };
  }, [categories, type]);

  useEffect(() => {
    if (visible && groups.length > 0) {
      if (selectedId) {
        const selectedCat = categories.find(c => c.id === selectedId || c.name === selectedId);
        if (selectedCat) {
          setActiveGroup(selectedCat.group || selectedCat.name);
          return;
        }
      }
      setActiveGroup(groups[0]);
    }
  }, [visible, groups, selectedId, categories]);

  const activeCategories = groupMap.get(activeGroup) || [];
  const groupColor = GROUP_COLORS[activeGroup] || Colors.Primary;
  const groupIcon = GROUP_ICONS[activeGroup] || 'grid-outline';

  // 대메뉴 자체를 선택 → 첫 번째 소메뉴를 선택하되, group 정보 포함
  const handleSelectGroup = () => {
    const first = activeCategories[0];
    if (first) {
      // group과 name을 동일하게 설정해서 "대메뉴만 선택" 표시
      const groupCategory: Category = {
        ...first,
        id: `group-${activeGroup}`,
        name: '전체',
        group: activeGroup,
        icon: groupIcon,
        color: groupColor,
      };
      onSelect(groupCategory);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handleBar} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>카테고리 선택</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Icon name="close" size={24} color={Colors.TextSecondary} />
                </TouchableOpacity>
              </View>

              {/* 좌우 분할 */}
              <View style={styles.splitContainer}>
                {/* 좌: 대메뉴 */}
                <View style={styles.leftPanel}>
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.leftContent}>
                    {groups.map(group => {
                      const isActive = activeGroup === group;
                      const gColor = GROUP_COLORS[group] || Colors.Primary;
                      return (
                        <TouchableOpacity
                          key={group}
                          style={[
                            styles.groupTab,
                            isActive && styles.groupTabActive,
                            isActive && { borderLeftColor: gColor },
                          ]}
                          onPress={() => setActiveGroup(group)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.groupTabText,
                              isActive && { color: Colors.Text, fontWeight: '700' },
                            ]}
                            numberOfLines={2}
                          >
                            {group}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* 우: 소메뉴 */}
                <ScrollView
                  style={styles.rightPanel}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.rightContent}
                >
                  {/* 대메뉴 직접 선택 */}
                  <TouchableOpacity
                    style={[styles.groupSelectBtn, { borderColor: groupColor + '40' }]}
                    onPress={handleSelectGroup}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.groupSelectIcon, { backgroundColor: groupColor + '18' }]}>
                      <Icon name={groupIcon} size={18} color={groupColor} />
                    </View>
                    <Text style={[styles.groupSelectText, { color: groupColor }]}>
                      {activeGroup} 전체
                    </Text>
                    <Icon name="chevron-forward" size={14} color={groupColor} />
                  </TouchableOpacity>

                  {/* 소메뉴 그리드 */}
                  <View style={styles.subGrid}>
                    {activeCategories.map(cat => {
                      const isSelected = selectedId === cat.id || selectedId === cat.name;
                      return (
                        <TouchableOpacity
                          key={cat.id || cat.name}
                          style={[
                            styles.subItem,
                            isSelected && { borderColor: cat.color, backgroundColor: cat.color + '12' },
                          ]}
                          onPress={() => {
                            onSelect(cat);
                            onClose();
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.subIconCircle, { backgroundColor: cat.color + '18' }]}>
                            <Icon name={cat.icon || 'cash-outline'} size={22} color={cat.color} />
                          </View>
                          <Text
                            style={[
                              styles.subItemText,
                              isSelected && { color: Colors.Text, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {cat.name}
                          </Text>
                          {isSelected && (
                            <View style={[styles.selectedBadge, { backgroundColor: cat.color }]}>
                              <Icon name="checkmark" size={10} color="#FFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.Background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SCREEN_HEIGHT * 0.55,
    paddingBottom: 34,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.CardBorder,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.Divider,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.Text,
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  // 좌: 대메뉴 - flexBasis로 고정, 절대 늘어나지 않음
  leftPanel: {
    flexBasis: LEFT_W,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: Colors.Surface,
    borderRightWidth: 1,
    borderRightColor: Colors.Divider,
  },
  leftContent: {
    paddingVertical: 4,
  },
  groupTab: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  groupTabActive: {
    backgroundColor: Colors.Background,
  },
  groupTabText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.TextMuted,
    textAlign: 'center',
  },
  // 우: 소메뉴
  rightPanel: {
    flex: 1,
    backgroundColor: Colors.Background,
  },
  rightContent: {
    padding: Spacing.md,
  },
  groupSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 12,
    gap: 8,
  },
  groupSelectIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupSelectText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  subGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  subItem: {
    flexBasis: '30%',
    flexGrow: 1,
    maxWidth: '32%',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.CardBorder,
    backgroundColor: Colors.Card,
    position: 'relative',
  },
  subIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  subItemText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.TextSecondary,
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CategorySelectModal;
