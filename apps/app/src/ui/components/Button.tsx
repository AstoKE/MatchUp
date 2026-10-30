import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Text shown to assistive tech while loading (e.g. the localized "Loading…"). */
  loadingLabel?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const inactive = Boolean(disabled) || loading;

  const fill =
    variant === 'primary'
      ? colors.actionPrimary
      : variant === 'destructive'
        ? colors.danger
        : 'transparent';
  const labelColor = inactive
    ? colors.textSecondary
    : variant === 'primary'
      ? colors.onActionPrimary
      : variant === 'destructive'
        ? colors.onDanger
        : variant === 'tertiary'
          ? colors.link
          : colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading && loadingLabel ? loadingLabel : label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        {
          minHeight: TOUCH_TARGET,
          minWidth: TOUCH_TARGET,
          paddingHorizontal: spacing[5],
          paddingVertical: spacing[3],
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing[2],
          backgroundColor: inactive && fill !== 'transparent' ? colors.surfaceSunken : fill,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.borderStrong,
          opacity: pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          ...(focused
            ? {
                outlineColor: colors.focusRing,
                outlineWidth: 2,
                outlineOffset: 2,
                outlineStyle: 'solid' as const,
              }
            : null),
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator accessibilityElementsHidden color={colors.textSecondary} />
      ) : null}
      <Text variant="label" style={{ color: labelColor }}>
        {label}
      </Text>
    </Pressable>
  );
}
