import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

/** A pill that can be switched on and off (multi-select such as sports or positions). */
export function ToggleChip({
  label,
  selected,
  onPress,
  disabled = false,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Decorative leading glyph, drawn in the chip's own text colour; the label stays the accessible name. */
  icon?: (color: string) => ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: TOUCH_TARGET,
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[2],
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.actionPrimary : colors.borderStrong,
        backgroundColor: selected ? colors.actionPrimary : 'transparent',
        opacity: disabled ? 0.5 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing[2],
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
      {icon ? <View>{icon(selected ? colors.onActionPrimary : colors.textPrimary)}</View> : null}
      <Text
        variant="label"
        style={{ color: selected ? colors.onActionPrimary : colors.textPrimary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
