import { View } from 'react-native';
import { Icon, type IconName } from '../graphics/Icon';
import { useTheme } from '../theme';
import { Text } from './Text';

export type StatusChipKind = 'approved' | 'pending' | 'waitlist';

const icons: Record<StatusChipKind, IconName> = {
  approved: 'check',
  pending: 'clock',
  waitlist: 'list',
};

/** Where a person stands with an event (docs/design.md §3.1): always an icon and words, never color alone. */
export function StatusChip({ kind, label }: { kind: StatusChipKind; label: string }) {
  const { colors, radius, spacing } = useTheme();
  const fill = {
    approved: colors.statusApproved,
    pending: colors.statusPending,
    waitlist: 'transparent',
  };
  const on = {
    approved: colors.onStatusApproved,
    pending: colors.onStatusPending,
    waitlist: colors.textPrimary,
  }[kind];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[1],
        paddingHorizontal: spacing[2],
        paddingVertical: spacing[1],
        borderRadius: radius.pill,
        backgroundColor: fill[kind],
        borderWidth: 1.5,
        borderColor: kind === 'waitlist' ? colors.textPrimary : fill[kind],
      }}
    >
      <Icon name={icons[kind]} color={on} size={14} />
      <Text variant="micro" style={{ color: on, flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}
