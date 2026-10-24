import { forwardRef, useId, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { MAX_FONT_SCALE, TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  /** Visible label (always shown — never placeholder-only). */
  label: string;
  hint?: string;
  /** Localized error message; presence marks the field invalid and is announced. */
  error?: string | undefined;
  containerStyle?: StyleProp<ViewStyle>;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, hint, error, containerStyle, onFocus, onBlur, ...rest },
  forwardedRef,
) {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const innerRef = useRef<TextInputInstance | null>(null);
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <View style={[{ gap: spacing[1] }, containerStyle]}>
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={() => innerRef.current?.focus()}
      >
        <Text variant="label">{label}</Text>
      </Pressable>
      <TextInput
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        placeholderTextColor={colors.textSecondary}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          ...typography.body,
          minHeight: TOUCH_TARGET,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          borderRadius: radius.md,
          borderWidth: error ? 2 : 1,
          borderColor: error ? colors.danger : colors.borderStrong,
          backgroundColor: colors.surfaceRaised,
          color: colors.textPrimary,
          ...(focused
            ? {
                outlineColor: colors.focusRing,
                outlineWidth: 2,
                outlineOffset: 2,
                outlineStyle: 'solid' as const,
              }
            : null),
        }}
        {...rest}
      />
      {error ? (
        <Text
          nativeID={`${id}-error`}
          variant="bodySm"
          tone="danger"
          role="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text nativeID={`${id}-hint`} variant="bodySm" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
