import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { fontFamily, TOUCH_TARGET } from '../tokens';
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
  // Inline buttons sit among chips and stay pills; a full-width one is the screen's action (design.md §3.3).
  const prominent = fullWidth && variant === 'primary';

  const fill = variant === 'primary' ? colors.actionPrimary : 'transparent';
  const labelColor = inactive
    ? colors.textSecondary
    : variant === 'primary'
      ? colors.onActionPrimary
      : variant === 'destructive'
        ? colors.danger
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
          minHeight: prominent ? 54 : fullWidth ? 48 : TOUCH_TARGET,
          minWidth: TOUCH_TARGET,
          paddingHorizontal: spacing[5],
          paddingVertical: spacing[3],
          borderRadius: prominent ? radius.button : fullWidth ? radius.md : radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing[2],
          backgroundColor:
            inactive && fill !== 'transparent'
              ? colors.surfaceSunken
              : pressed && variant === 'primary'
                ? colors.actionPrimaryPressed
                : fill,
          // Destructive is outlined: a filled danger red would read like the primary action (docs/design.md §11).
          borderWidth: variant === 'secondary' || variant === 'destructive' ? 1.5 : 0,
          borderColor: inactive
            ? colors.borderStrong
            : variant === 'destructive'
              ? colors.danger
              : colors.textPrimary,
          opacity: pressed && variant !== 'primary' ? 0.85 : 1,
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
      <Text
        variant="label"
        style={{
          color: labelColor,
          ...(prominent ? { fontFamily: fontFamily.extrabold, fontSize: 17 } : null),
          ...(variant === 'tertiary' ? { textDecorationLine: 'underline' as const } : null),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
