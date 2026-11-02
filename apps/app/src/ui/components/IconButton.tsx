import { useState } from 'react';
import { Pressable } from 'react-native';
import { Icon, type IconName } from '../graphics/Icon';
import { TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';

/** A round icon-only control. The label is its accessible name; there is no visible text. */
export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        width: TOUCH_TARGET,
        height: TOUCH_TARGET,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceOverlay,
        borderWidth: 1.5,
        borderColor: colors.textPrimary,
        opacity: pressed ? 0.85 : 1,
        ...(focused
          ? {
              outlineColor: colors.focusRing,
              outlineWidth: 2,
              outlineOffset: 2,
              outlineStyle: 'solid' as const,
            }
          : null),
      })}
    >
      <Icon name={icon} color={colors.textPrimary} />
    </Pressable>
  );
}
