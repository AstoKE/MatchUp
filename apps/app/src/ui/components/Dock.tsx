import { createContext, useContext, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../graphics/Icon';
import { TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

const DOCK_HEIGHT = 64;

/** How much of the bottom of the window the dock takes, so a `Screen` can keep its content clear of it. */
const DockSpace = createContext(0);
export const DockSpaceProvider = DockSpace.Provider;
export const useDockSpace = () => useContext(DockSpace);

export function useVisibleDockSpace() {
  const { spacing } = useTheme();
  return DOCK_HEIGHT + spacing[4] + spacing[2] + useSafeAreaInsets().bottom;
}

export interface DockItem {
  key: string;
  label: string;
  /** Falls back to `label`, which a phone does not show: the name must exist either way. */
  accessibilityLabel?: string | undefined;
  icon: IconName;
  /** The round create action. */
  emphasized?: boolean | undefined;
  selected: boolean;
  onPress: () => void;
}

/** Primary navigation, floating over the page on every screen size (docs/design.md §5.1, §6). */
export function Dock({ items }: { items: readonly DockItem[] }) {
  const { colors, radius, spacing, breakpoint } = useTheme();
  const insets = useSafeAreaInsets();
  const compact = breakpoint === 'compact';
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing[4],
        right: spacing[4],
        bottom: spacing[4] + insets.bottom,
        alignItems: 'center',
      }}
    >
      <View
        role="tablist"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[1],
          minHeight: DOCK_HEIGHT,
          paddingHorizontal: spacing[2],
          borderRadius: radius.pill,
          backgroundColor: colors.dock,
          borderWidth: 1,
          borderColor: colors.dockBorder,
          boxShadow: `0 10px 28px ${colors.shadow}`,
          ...(compact ? { width: '100%', maxWidth: 440 } : null),
        }}
      >
        {items.map((item) => (
          <DockButton key={item.key} item={item} showLabel={!compact} />
        ))}
      </View>
    </View>
  );
}

function DockButton({ item, showLabel }: { item: DockItem; showLabel: boolean }) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const on = item.emphasized
    ? colors.onActionPrimary
    : item.selected
      ? colors.onDockActive
      : colors.onDock;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      accessibilityState={{ selected: item.selected }}
      aria-selected={item.selected}
      onPress={item.onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[2],
        minHeight: item.emphasized ? 52 : 48,
        minWidth: item.emphasized ? 52 : Math.max(TOUCH_TARGET, 56),
        paddingHorizontal: showLabel && !item.emphasized ? spacing[4] : 0,
        borderRadius: radius.pill,
        backgroundColor: item.emphasized
          ? colors.actionPrimary
          : item.selected
            ? colors.dockActive
            : 'transparent',
        opacity: pressed ? 0.85 : 1,
        ...(focused
          ? {
              outlineColor: colors.dockFocusRing,
              outlineWidth: 2,
              outlineOffset: 2,
              outlineStyle: 'solid' as const,
            }
          : null),
      })}
    >
      <Icon name={item.icon} color={on} size={item.emphasized ? 26 : 22} />
      {showLabel && !item.emphasized ? (
        <Text variant="label" style={{ color: on }}>
          {item.label}
        </Text>
      ) : null}
    </Pressable>
  );
}
