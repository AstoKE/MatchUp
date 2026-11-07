import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { fontFamily } from '../tokens';
import { useReducedMotion, useTheme } from '../theme';
import { Text } from './Text';

export interface WheelOption<T extends string | number> {
  value: T;
  label: string;
}

const ITEM = 44;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM;

/**
 * One scrolling column of a wheel picker (iOS style), the same on every platform: it snaps to an
 * option, a tap on an option picks it, and for assistive tech and the keyboard it is a single
 * adjustable control (swipe up/down, arrow keys, Page Up/Down, Home/End) that reads the chosen option.
 */
export function WheelPicker<T extends string | number>({
  label,
  options,
  value,
  onChange,
  width,
}: {
  /** The accessible name, e.g. "Hour". */
  label: string;
  options: readonly WheelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  width?: number;
}) {
  const { colors, radius, spacing } = useTheme();
  const reduced = useReducedMotion();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only a person moves the value by scrolling. A scroll the wheel did not ask for from them (the initial position not
  // applied yet, a layout pass, the browser restoring a position) must never change it: the wheel goes back instead.
  const touched = useRef(false);
  const [focused, setFocused] = useState(false);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  // The option under the band while the wheel moves; the committed one otherwise.
  const [centered, setCentered] = useState(selected);
  const last = options.length - 1;

  const scrollToIndex = (index: number, animated: boolean) =>
    scroller.current?.scrollTo({ y: index * ITEM, animated: animated && !reduced });

  // Follow the value when it changes from outside (a quick-pick chip): adjust during render, then scroll.
  const [shown, setShown] = useState(selected);
  if (shown !== selected) {
    setShown(selected);
    setCentered(selected);
  }
  useEffect(() => {
    scrollToIndex(selected, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new selection moves the wheel
  }, [selected, options.length]);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  // The web: a mouse wheel, a pointer or a finger on the column counts as the person's own scroll.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (
      scroller.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null
    )?.getScrollableNode?.();
    if (!node) return;
    const mark = () => {
      touched.current = true;
    };
    const events = ['wheel', 'pointerdown', 'touchstart'] as const;
    for (const name of events) node.addEventListener(name, mark, { passive: true });
    return () => {
      for (const name of events) node.removeEventListener(name, mark);
    };
  }, []);

  const pick = (index: number, animated = true) => {
    const clamped = Math.min(last, Math.max(0, index));
    setCentered(clamped);
    scrollToIndex(clamped, animated);
    const option = options[clamped];
    if (option && option.value !== value) onChange(option.value);
  };

  const indexAt = (y: number) => Math.min(last, Math.max(0, Math.round(y / ITEM)));

  /** End of a scroll: the person's lands on a row; any other is undone. */
  const land = (index: number) => {
    if (touched.current) {
      touched.current = false;
      pick(index);
    } else if (index !== selected) {
      setCentered(selected);
      scrollToIndex(selected, false);
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = indexAt(y);
    if (touched.current && index !== centered) setCentered(index);
    // The web has no momentum events: settle once the wheel or the drag has stopped.
    if (Platform.OS === 'web') {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => land(index), 140);
    }
  };
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    land(indexAt(e.nativeEvent.contentOffset.y));

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') pick(selected + 1);
    if (e.nativeEvent.actionName === 'decrement') pick(selected - 1);
  };
  const keys: Record<string, number> = {
    ArrowDown: selected + 1,
    ArrowUp: selected - 1,
    PageDown: selected + 5,
    PageUp: selected - 5,
    Home: 0,
    End: last,
  };

  return (
    <View
      accessible
      focusable
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: last,
        now: selected,
        text: options[selected]?.label ?? '',
      }}
      // React Native Web does not map accessibilityValue: the web reads these.
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={selected}
      aria-valuetext={options[selected]?.label ?? ''}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // React Native Web passes key events of a focusable View through.
      {...({
        onKeyDown: (e: { key: string; preventDefault: () => void }) => {
          const target = keys[e.key];
          if (target === undefined) return;
          e.preventDefault();
          pick(target);
        },
      } as object)}
      style={{
        width,
        flexGrow: width === undefined ? 1 : 0,
        height: ITEM * VISIBLE,
        borderRadius: radius.md,
        ...(focused
          ? {
              outlineColor: colors.focusRing,
              outlineWidth: 2,
              outlineOffset: 2,
              outlineStyle: 'solid' as const,
            }
          : null),
      }}
    >
      {/* The band behind the chosen row. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: PAD,
          left: 0,
          right: 0,
          height: ITEM,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSunken,
        }}
      />
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          touched.current = true;
        }}
        onMomentumScrollEnd={onEnd}
        // The first position is applied once the rows have a size (an earlier scrollTo is ignored).
        onContentSizeChange={() => scrollToIndex(selected, false)}
        // A slow drag without a fling ends without momentum.
        onScrollEndDrag={(e) => {
          const velocity = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(velocity) < 0.05) onEnd(e);
        }}
        contentContainerStyle={{ paddingVertical: PAD }}
        importantForAccessibility="no-hide-descendants"
      >
        {options.map((option, index) => {
          const distance = Math.abs(index - centered);
          return (
            <Pressable
              key={String(option.value)}
              accessible={false}
              focusable={false}
              tabIndex={-1}
              onPress={() => pick(index)}
              style={{
                height: ITEM,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: spacing[2],
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: distance === 0 ? 20 : 17,
                  fontFamily: distance === 0 ? fontFamily.bold : fontFamily.regular,
                  color: distance === 0 ? colors.textPrimary : colors.textSecondary,
                  opacity: distance === 0 ? 1 : distance === 1 ? 0.75 : 0.45,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
