import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { Text, TOUCH_TARGET, useTheme } from '@/ui';
import { useUnreadCount } from './hooks';

/** The way to the inbox, with the unread count as text (never colour alone). Hidden for guests. */
export function NotificationBell() {
  const { t } = useTranslation('notifications');
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const session = useSession();
  const unread = useUnreadCount();
  const [focused, setFocused] = useState(false);
  if (session.status !== 'authenticated') return null;
  const count = unread.data ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? t('bellUnread', { count }) : t('bell')}
      onPress={() => router.push('/notifications')}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: TOUCH_TARGET,
        minWidth: TOUCH_TARGET,
        paddingHorizontal: spacing[3],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing[2],
        ...(focused
          ? {
              outlineColor: colors.focusRing,
              outlineWidth: 2,
              outlineOffset: 2,
              outlineStyle: 'solid' as const,
            }
          : null),
      }}
    >
      <Text variant="label">{t('bell')}</Text>
      {count > 0 ? (
        <View
          style={{
            minWidth: 24,
            paddingHorizontal: spacing[1],
            borderRadius: radius.pill,
            backgroundColor: colors.actionPrimary,
            alignItems: 'center',
          }}
        >
          <Text variant="label" style={{ color: colors.onActionPrimary }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
