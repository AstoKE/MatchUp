import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Button,
  EmptyState,
  Screen,
  Skeleton,
  Text,
  TOUCH_TARGET,
  useTheme,
  Icon,
  ScreenHeader,
  type IconName,
} from '@/ui';
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
  const router = useRouter();
  const list = useNotifications();
  const markRead = useMarkRead();
  const items = list.data ?? [];
  const hasUnread = items.some((n) => !n.read);

  return (
    <Screen maxWidth={640}>
      <ScreenHeader
        title={t('notifications:title')}
        backLabel={t('common:back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
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
        <EmptyState
          title={t('notifications:emptyTitle')}
          body={t('notifications:emptyBody')}
          actionLabel={t('notifications:emptyAction')}
          onAction={() => router.push('/')}
        />
      ) : (
        <View role="list" style={{ gap: spacing[2] }}>
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

/** Good and bad news are told apart at a glance; the words carry the meaning, the icon is decorative. */
function lookOf(type: AppNotification['type']): {
  icon: IconName;
  color: 'success' | 'danger' | 'textSecondary';
} {
  if (type === 'REQUEST_APPROVED') return { icon: 'check', color: 'success' };
  if (
    type === 'REQUEST_REJECTED' ||
    type === 'PARTICIPANT_REMOVED' ||
    type === 'EVENT_CANCELED' ||
    type === 'EVENT_CANCELED_BY_ADMIN'
  ) {
    return { icon: 'alert', color: 'danger' };
  }
  return { icon: 'calendar', color: 'textSecondary' };
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
  const look = lookOf(notification.type);
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
        flexDirection: 'row',
        gap: spacing[3],
        padding: spacing[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: notification.read ? 'transparent' : colors.surfaceRaised,
      }}
    >
      <Icon name={look.icon} color={colors[look.color]} />
      <View style={{ flex: 1, gap: spacing[1] }}>
        <Text variant={notification.read ? 'bodySm' : 'label'}>{text}</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2] }}
        >
          {notification.read ? null : (
            <Text variant="micro" style={{ color: colors.link }}>
              {t('new')}
            </Text>
          )}
          <Text variant="caption" tone="secondary">
            {when}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
