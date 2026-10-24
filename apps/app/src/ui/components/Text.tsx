import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { MAX_FONT_SCALE, type TypographyVariant } from '../tokens';
import { useTheme } from '../theme';

type TextTone = 'primary' | 'secondary' | 'link' | 'danger' | 'success' | 'warning' | 'onAction';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Renders as a semantic heading of the given level (1–6) for screen readers and web outline. */
  heading?: 1 | 2 | 3 | 4 | 5 | 6;
}

export function Text({
  variant = 'body',
  tone = 'primary',
  heading,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: TextProps) {
  const { colors, typography } = useTheme();
  const toneColor: Record<TextTone, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    link: colors.link,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    onAction: colors.onActionPrimary,
  };
  return (
    <RNText
      role={heading ? 'heading' : undefined}
      aria-level={heading}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], { color: toneColor[tone] }, style]}
      {...rest}
    />
  );
}
