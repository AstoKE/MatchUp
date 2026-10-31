import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { localizedName, useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Button, EmptyState, Icon, Screen, Text, useTheme } from '@/ui';
import { formatEventStart } from '../format';
import { useEvent, useMyParticipation } from '../hooks';

const OUTCOMES = {
  REQUESTED: { icon: 'clock', tone: 'warning' },
  WAITLISTED: { icon: 'clock', tone: 'warning' },
  APPROVED: { icon: 'check', tone: 'success' },
} as const;

/**
 * After a request (docs/design.md §5.4). The outcome comes from the server, never from the previous screen or the URL, so
 * green can only mean a real approval. Without an active request this page has nothing to say: back to the event.
 */
export function RequestStatusScreen() {
  const { t } = useTranslation(['events', 'common']);
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const session = useSession();
  const locale = currentLocale();
  const params = useLocalSearchParams<{ id: string; invite?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const inviteToken = typeof params.invite === 'string' ? params.invite : null;
  const signedIn = session.status === 'authenticated';
  const event = useEvent(id, inviteToken);
  const catalog = useCatalog();
  const mine = useMyParticipation(id, signedIn);
  const status = mine.data?.status;
  const outcome =
    status === 'REQUESTED' || status === 'WAITLISTED' || status === 'APPROVED' ? status : null;
  const eventPage = {
    pathname: '/e/[id]' as const,
    params: inviteToken ? { id, invite: inviteToken } : { id },
  };
  const nothingToShow =
    session.status !== 'loading' && (!signedIn || (!mine.isPending && !outcome));

  useEffect(() => {
    if (nothingToShow) router.replace(eventPage);
    // eventPage is rebuilt each render from these same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToShow]);

  if (event.isError || catalog.isError || mine.isError) {
    return (
      <Screen maxWidth={640}>
        <EmptyState
          title={t('events:detail.loadFailed')}
          body={errorText(event.error ?? catalog.error ?? mine.error)}
          actionLabel={t('common:retry')}
          onAction={() => {
            void event.refetch();
            void catalog.refetch();
            void mine.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!outcome || !event.data || !catalog.data) {
    return (
      <Screen maxWidth={640}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }

  const data = event.data;
  const sport = catalog.data.sports.find((s) => s.id === data.sportId);
  const city = catalog.data.cities.find((c) => c.id === data.cityId);
  const district = city?.districts.find((d) => d.id === data.districtId);
  const districtName = district ? localizedName(district.names, locale) : '';
  const place = data.private?.placeLabel ?? data.publicPlaceLabel;
  const { icon, tone } = OUTCOMES[outcome];
  const rows: [string, string][] = [
    [t('events:submitted.sport'), sport ? localizedName(sport.names, locale) : ''],
    [t('events:submitted.event'), data.title],
    [
      t('events:detail.when'),
      formatEventStart(data.startsAt, city?.timeZone ?? 'Europe/Istanbul', locale),
    ],
    [
      t('events:detail.where'),
      place
        ? [districtName, place].filter(Boolean).join(' · ')
        : t('events:detail.whereHidden', { district: districtName }),
    ],
    [t('events:submitted.status'), t(`events:join.state.${outcome}`)],
  ];

  return (
    <Screen maxWidth={640} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', gap: spacing[3] }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors[tone],
          }}
        >
          <Icon name={icon} color={colors[tone]} size={32} />
        </View>
        <Text
          variant="headline"
          heading={1}
          style={{ textAlign: 'center' }}
          accessibilityLiveRegion="polite"
        >
          {t(`events:submitted.title.${outcome}`)}
        </Text>
        <Text tone="secondary" style={{ textAlign: 'center' }}>
          {t(`events:submitted.body.${outcome}`)}
        </Text>
      </View>
      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          backgroundColor: colors.surfaceRaised,
        }}
      >
        {rows.map(([label, value], index) => (
          <View
            key={label}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: spacing[2],
              padding: spacing[3],
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.borderSubtle,
            }}
          >
            <Text variant="bodySm" tone="secondary">
              {label}
            </Text>
            <Text variant="label" style={{ flexShrink: 1 }}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ gap: spacing[2] }}>
        <Button
          label={t('events:submitted.goMine')}
          onPress={() => router.replace('/my-events')}
          fullWidth
        />
        <Button
          variant="secondary"
          label={t('events:submitted.viewEvent')}
          onPress={() => router.replace(eventPage)}
          fullWidth
        />
      </View>
    </Screen>
  );
}
