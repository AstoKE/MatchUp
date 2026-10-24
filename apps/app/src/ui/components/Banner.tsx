import { View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

export type BannerKind = 'info' | 'warning' | 'danger' | 'success';

/** Inline status message. Never color-only: always carries text (and role="alert" for danger). */
export function Banner({ kind = 'info', message }: { kind?: BannerKind; message: string }) {
  const { colors, spacing, radius } = useTheme();
  const accent = {
    info: colors.borderStrong,
    warning: colors.warning,
    danger: colors.danger,
    success: colors.success,
  }[kind];
  return (
    <View
      style={{
        borderLeftWidth: 4,
        borderLeftColor: accent,
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.md,
        padding: spacing[3],
      }}
    >
      <Text
        variant="bodySm"
        role={kind === 'danger' ? 'alert' : 'status'}
        accessibilityLiveRegion={kind === 'danger' ? 'assertive' : 'polite'}
      >
        {message}
      </Text>
    </View>
  );
}
