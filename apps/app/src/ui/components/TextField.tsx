import { forwardRef, useId, useState } from 'react';
import {
  Platform,
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
  const id = useId();
  const webLabelProps = (Platform.OS === 'web' ? { htmlFor: id } : {}) as object;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <View style={[{ gap: spacing[1] }, containerStyle]}>
      {/*
        Label association: on web this renders a real <label for=…> (screen readers and click-to-focus).
        On native the input carries its own accessibility label, so the visible label is hidden from
        assistive tech — otherwise TalkBack/VoiceOver would stop on, and read, every label twice
        (found by the Android accessibility-tree dump, docs/NATIVE_VALIDATION.md).
      */}
      <Text
        variant="label"
        accessibilityElementsHidden={Platform.OS !== 'web'}
        importantForAccessibility={Platform.OS === 'web' ? 'auto' : 'no'}
        {...webLabelProps}
      >
        {label}
      </Text>
      <TextInput
        ref={forwardedRef}
        nativeID={id}
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
          minHeight: 52,
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[2],
          borderRadius: radius.md,
          borderWidth: error ? 2 : 1.5,
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
