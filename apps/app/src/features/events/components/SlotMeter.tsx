import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text, useTheme } from '@/ui';

/**
 * Filled-spots meter (design.md §4.2 rule 3): the track is a 1 px `borderStrong` outline on the sunken
 * surface so it stays perceivable (the lighter track measured 2.1:1 and was rejected). It is decorative:
 * the numbers beside it carry the meaning, so it is hidden from assistive tech.
 */
export function SlotMeter({ approved, capacity }: { approved: number; capacity: number }) {
  const { colors, radius } = useTheme();
  const fill = capacity > 0 ? Math.min(1, Math.max(0, approved / capacity)) : 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        height: 10,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.round(fill * 100)}%`,
          height: '100%',
          backgroundColor: colors.actionPrimary,
        }}
      />
    </View>
  );
}

/** Small status label. Never colour alone: it always carries words (design.md §4.2 rule 2). */
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
      {icon}
      <Text variant="micro">{label}</Text>
    </View>
  );
}
