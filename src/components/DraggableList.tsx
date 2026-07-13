import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ViewStyle, Vibration } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence } from 'react-native-reanimated';
import { Sortable, SortableItem } from 'react-native-reanimated-dnd';
import type { SortableData, SortableRenderItemProps } from 'react-native-reanimated-dnd';

interface DraggableListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  onReorder: (reorderedData: T[]) => void;
  onItemPress?: (item: T, index: number) => void;
  itemHeight: number;
  style?: ViewStyle;
}

interface WrappedItem<T> extends SortableData {
  id: string;
  originalItem: T;
  originalIndex: number;
}

// 별도 컴포넌트로 분리해야 hooks 사용 가능
function DraggableItemContent<T>({
  item,
  index,
  itemHeight,
  onPress,
  renderItem,
}: {
  item: T;
  index: number;
  itemHeight: number;
  onPress?: () => void;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  // useSharedValue는 UI 스레드에서 동작 → React 리렌더 없음
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleLongPress = useCallback(() => {
    Vibration.vibrate(30);
    // 확대 → 유지 → 축소 (리렌더 없이 UI 스레드에서 실행)
    scale.value = withSequence(
      withTiming(1.05, { duration: 100 }),
      withDelay(300, withTiming(1, { duration: 150 })),
    );
  }, [scale]);

  return (
    <Animated.View style={[{ height: itemHeight }, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={200}
        style={{ flex: 1 }}
      >
        {renderItem(item, index)}
      </Pressable>
    </Animated.View>
  );
}

export function DraggableList<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  onItemPress,
  itemHeight,
  style,
}: DraggableListProps<T>) {
  // Internal state - updated immediately on drop
  const [internalData, setInternalData] = useState(data);
  const justDroppedRef = useRef(false);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const keyExtractorRef = useRef(keyExtractor);
  keyExtractorRef.current = keyExtractor;

  // Sync from external data (Firestore updates etc.) ONLY when not from our own drop
  useEffect(() => {
    if (justDroppedRef.current) {
      justDroppedRef.current = false;
      return; // Skip - this is our own drop propagating back
    }
    setInternalData(data);
  }, [data]);

  const wrappedData = useMemo<WrappedItem<T>[]>(() =>
    internalData.map((item, index) => ({
      id: keyExtractor(item),
      originalItem: item,
      originalIndex: index,
    })),
    [internalData, keyExtractor]
  );

  const handleDrop = useCallback((id: string, _position: number, allPositions?: { [id: string]: number }) => {
    if (!allPositions) return;

    // Build id->item lookup from current internal data
    const idToItem = new Map<string, T>();
    const currentData = internalData;
    currentData.forEach((item) => {
      idToItem.set(keyExtractorRef.current(item), item);
    });

    // Sort by final positions
    const entries = Object.entries(allPositions).sort((a, b) => a[1] - b[1]);
    const newData: T[] = [];
    for (const [itemId] of entries) {
      const item = idToItem.get(itemId);
      if (item) newData.push(item);
    }

    if (newData.length === currentData.length) {
      // Set flag BEFORE updating - so useEffect skips the incoming data update
      justDroppedRef.current = true;
      // Update internal state immediately (instant remount via key)
      setInternalData(newData);
      // Call parent for persistence (async Firestore)
      onReorderRef.current(newData);
    }
  }, [internalData]);

  // Key forces instant remount - no stepping animation
  const sortableKey = useMemo(
    () => internalData.map(d => keyExtractor(d)).join('|'),
    [internalData, keyExtractor]
  );

  return (
    <View style={[{ flex: 1 }, style]}>
      <Sortable
        key={sortableKey}
        data={wrappedData}
        itemHeight={itemHeight}
        renderItem={(props: SortableRenderItemProps<WrappedItem<T>>) => (
          <SortableItem
            key={props.id}
            id={props.id}
            data={props.item}
            positions={props.positions}
            lowerBound={props.lowerBound}
            autoScrollDirection={props.autoScrollDirection}
            itemsCount={props.itemsCount}
            itemHeight={props.itemHeight}
            onDrop={handleDrop}
          >
            <DraggableItemContent
              item={props.item.originalItem}
              index={props.index}
              itemHeight={itemHeight}
              onPress={onItemPress ? () => {
                const wrapped = wrappedData.find(w => w.id === props.id);
                if (wrapped) onItemPress(wrapped.originalItem, wrapped.originalIndex);
              } : undefined}
              renderItem={renderItem}
            />
          </SortableItem>
        )}
      />
    </View>
  );
}
