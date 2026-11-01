import { View } from 'react-native';
import { Icon } from '../graphics/Icon';
import { useTheme } from '../theme';
import { Text } from './Text';

export type BannerKind = 'info' | 'warning' | 'danger' | 'success';

/** Inline status message. Never color-only: always text, an icon when it is bad news, role="alert" for danger. */
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
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing[2],
      }}
    >
      {kind === 'warning' || kind === 'danger' ? (
        <Icon name="alert" color={accent} size={20} />
      ) : null}
      <Text
        variant="bodySm"
        style={{ flex: 1 }}
        role={kind === 'danger' ? 'alert' : 'status'}
        accessibilityLiveRegion={kind === 'danger' ? 'assertive' : 'polite'}
      >
        {message}
      </Text>
    </View>
  );
}
