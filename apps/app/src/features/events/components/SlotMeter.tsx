import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, Text, useTheme } from '@/ui';

/**
 * Filled spots as dots (docs/design.md §5.2), or a bar when there are too many to count at a glance. Filled and open differ
 * in shape as well as color. Decorative: the numbers beside it carry the meaning, so it is hidden from assistive tech.
 */
export function SlotMeter({ approved, capacity }: { approved: number; capacity: number }) {
  const { colors, radius, spacing } = useTheme();
  const fill = capacity > 0 ? Math.min(1, Math.max(0, approved / capacity)) : 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={
        capacity <= 30
          ? { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] }
          : {
              height: 10,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              overflow: 'hidden',
            }
      }
    >
      {capacity <= 30 ? (
        Array.from({ length: capacity }, (_, index) => (
          <View
            key={index}
            style={{
              width: 18,
              height: 18,
              borderRadius: radius.pill,
              borderWidth: 2,
              borderColor: colors.textPrimary,
              backgroundColor: index < approved ? colors.textPrimary : 'transparent',
            }}
          />
        ))
      ) : (
        <View
          style={{
            width: `${Math.round(fill * 100)}%`,
            height: '100%',
            backgroundColor: colors.textPrimary,
          }}
        />
      )}
    </View>
  );
}

/** Small status label. Never colour alone: it always carries words; bad news also carries an icon. */
export function Pill({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  /** Decorative leading glyph (e.g. the sport icon). */
  icon?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const { colors, radius, spacing } = useTheme();
  const accent = {
    neutral: colors.borderStrong,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: spacing[2],
        paddingVertical: 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: colors.surfaceSunken,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
      }}
    >
      {tone === 'danger' ? <Icon name="alert" color={colors.danger} size={14} /> : null}
      {icon}
      <Text variant="micro">{label}</Text>
    </View>
  );
}
