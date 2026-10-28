import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Button, EmptyState, Screen, Skeleton, Text, TOUCH_TARGET, useTheme } from '@/ui';
import type { AppNotification } from '../api/notifications-api';
import { useMarkRead, useNotifications } from '../hooks';

/** The inbox (ADR-0019: polled). Tapping an item marks it read and opens the event it is about. */
export function NotificationsScreen() {
  return (
    <RequireOnboarded>
      <Inbox />
    </RequireOnboarded>
  );
}

function Inbox() {
  const { t } = useTranslation(['notifications', 'common']);
  const { spacing } = useTheme();
  const list = useNotifications();
  const markRead = useMarkRead();
  const items = list.data ?? [];
  const hasUnread = items.some((n) => !n.read);

  return (
    <Screen maxWidth={640}>
      <Text variant="headline" heading={1}>
        {t('notifications:title')}
      </Text>
      {hasUnread ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            variant="secondary"
            label={t('notifications:markAllRead')}
            loading={markRead.isPending}
            loadingLabel={t('common:loading')}
            onPress={() => markRead.mutate(undefined)}
          />
        </View>
      ) : null}
      {list.isError ? (
        <EmptyState
          title={t('notifications:loadFailed')}
          body={errorText(list.error)}
          actionLabel={t('common:retry')}
          onAction={() => void list.refetch()}
        />
      ) : list.isPending ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('common:loading')}
          style={{ gap: spacing[3] }}
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height={72} radiusKey="lg" />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState title={t('notifications:emptyTitle')} body={t('notifications:emptyBody')} />
      ) : (
        <View role="list" style={{ gap: spacing[3] }}>
          {items.map((n) => (
            <View key={n.id} role="listitem">
              <Row notification={n} onOpen={() => markRead.mutate([n.id])} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Row({ notification, onOpen }: { notification: AppNotification; onOpen: () => void }) {
  const { t } = useTranslation('notifications');
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const event = notification.eventTitle ?? t('eventFallback');
  const text = notification.type ? t(`type.${notification.type}`, { event }) : t('unknown');
  const when = new Intl.DateTimeFormat(currentLocale(), {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(notification.createdAt));
  const eventId = notification.eventId;
  return (
    <Pressable
      accessibilityRole={eventId ? 'link' : 'text'}
      disabled={!eventId}
      onPress={() => {
        if (!notification.read) onOpen();
        if (eventId) router.push({ pathname: '/e/[id]', params: { id: eventId } });
      }}
      style={{
        minHeight: TOUCH_TARGET,
        gap: spacing[1],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: notification.read ? colors.borderSubtle : colors.actionPrimary,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      {notification.read ? null : (
        <Text variant="label" style={{ color: colors.link }}>
          {t('new')}
        </Text>
      )}
      <Text variant={notification.read ? 'body' : 'titleSm'}>{text}</Text>
      <Text variant="caption" tone="secondary">
        {when}
      </Text>
    </Pressable>
  );
}
