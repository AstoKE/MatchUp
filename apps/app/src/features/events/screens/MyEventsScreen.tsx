import { MY_EVENT_BUCKETS, type MyEventBucket } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { VerifyEmailBanner } from '@/features/auth';
import { useCatalog } from '@/features/catalog';
import { NotificationBell } from '@/features/notifications';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { i18n } from '@/lib/i18n';
import { Button, EmptyState, Screen, SegmentedChoice, Skeleton, Text, useTheme } from '@/ui';
import type { MyEventItem } from '../api/my-events-api';
import { EventListRow, type CardBadge } from '../components/EventListRow';
import { useMyEvents } from '../hooks';

/** What the caller should know at a glance, besides what the card already says: state + own request. */
function badgesFor(event: MyEventItem): CardBadge[] {
  const t = i18n.t.bind(i18n);
  const badges: CardBadge[] = [];
  if (event.status === 'DRAFT') badges.push({ label: t('events:status.DRAFT'), tone: 'neutral' });
  if (event.status === 'CANCELED') {
    badges.push({ label: t('events:status.CANCELED'), tone: 'danger' });
  }
  if (event.status === 'COMPLETED') {
    badges.push({ label: t('events:status.COMPLETED'), tone: 'neutral' });
  }
  if (event.pendingCount) {
    badges.push({
      label: t('events:mine.pendingRequests', { count: event.pendingCount }),
      tone: 'warning',
    });
  }
  if (event.myStatus && event.myStatus !== 'ORGANIZER') {
    const tone =
      event.myStatus === 'APPROVED'
        ? 'success'
        : event.myStatus === 'REQUESTED'
          ? 'neutral'
          : 'warning';
    badges.push({ label: t(`events:mine.status.${event.myStatus}`), tone });
  }
  return badges;
}

/**
 * My Events (PRD §4.5): the caller's own events and participations in five tabs. Needs an account.
 * Requests and approvals arrive with participation (M4); until then ORGANIZING and PAST hold the rows.
 */
export function MyEventsScreen() {
  // The queries live below the gate: a guest is redirected without ever asking the server.
  return (
    <RequireOnboarded>
      <MyEventsContent />
    </RequireOnboarded>
  );
}

function MyEventsContent() {
  const { t } = useTranslation(['events', 'common', 'nav']);
  const { spacing } = useTheme();
  const router = useRouter();
  const catalog = useCatalog();
  const [bucket, setBucket] = useState<MyEventBucket>('ORGANIZING');
  const list = useMyEvents(bucket);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <Screen>
        <VerifyEmailBanner />
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing[3],
          }}
        >
          <Text variant="headline" heading={1}>
            {t('nav:myEvents')}
          </Text>
          <NotificationBell />
        </View>
        <SegmentedChoice
          label={t('events:mine.bucketLabel')}
          options={MY_EVENT_BUCKETS.map((value) => ({
            value,
            label: t(`events:mine.bucket.${value}`),
          }))}
          value={bucket}
          onChange={setBucket}
        />

        {list.isError || catalog.isError ? (
          <EmptyState
            title={t('events:mine.loadFailed')}
            body={errorText(list.error ?? catalog.error)}
            actionLabel={t('common:retry')}
            onAction={() => {
              if (list.isError) void list.refetch();
              if (catalog.isError) void catalog.refetch();
            }}
          />
        ) : list.isPending || !catalog.data ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('common:loading')}
            style={{ gap: spacing[3] }}
          >
            {[0, 1].map((n) => (
              <Skeleton key={n} height={140} radiusKey="lg" />
            ))}
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            title={t(`events:mine.empty.${bucket}.title`)}
            body={t(`events:mine.empty.${bucket}.body`)}
            actionLabel={t(
              bucket === 'ORGANIZING' ? 'events:mine.createFirst' : 'events:mine.browse',
            )}
            onAction={() => router.push(bucket === 'ORGANIZING' ? '/create' : '/')}
          />
        ) : (
          <View style={{ gap: spacing[3] }}>
            <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
              {t('events:discover.resultCount', { count: items.length })}
            </Text>
            <View role="list" style={{ gap: spacing[3] }}>
              {items.map((event) => (
                <View key={event.id} role="listitem">
                  <EventListRow event={event} catalog={catalog.data} badges={badgesFor(event)} />
                </View>
              ))}
            </View>
            {list.hasNextPage ? (
              <Button
                label={t('events:discover.loadMore')}
                variant="secondary"
                loading={list.isFetchingNextPage}
                loadingLabel={t('events:discover.loadMoreLoading')}
                onPress={() => void list.fetchNextPage()}
              />
            ) : null}
          </View>
        )}
      </Screen>
    </>
  );
}
