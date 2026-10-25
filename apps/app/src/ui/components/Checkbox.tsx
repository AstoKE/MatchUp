import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * A labelled checkbox. The whole row is the touch target (≥ 44 pt). Keep the label plain text:
 * links belong next to it, not inside it (nested interactive elements confuse screen readers).
 */
export function Checkbox({
  label,
  checked,
  onChange,
  error,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: spacing[1] }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        aria-invalid={error ? true : undefined}
        onPress={() => onChange(!checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          minHeight: TOUCH_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
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
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 24,
            height: 24,
            borderRadius: radius.sm,
            borderWidth: 2,
            borderColor: error
              ? colors.danger
              : checked
                ? colors.actionPrimary
                : colors.borderStrong,
            backgroundColor: checked ? colors.actionPrimary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? (
            <Text variant="label" style={{ color: colors.onActionPrimary, lineHeight: 18 }}>
              ✓
            </Text>
          ) : null}
        </View>
        <Text style={{ flex: 1 }}>{label}</Text>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="danger" role="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
