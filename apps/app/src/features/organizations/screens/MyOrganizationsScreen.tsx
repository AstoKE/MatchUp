import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Banner, Button, EmptyState, Screen, ScreenHeader, Skeleton, Text, useTheme } from '@/ui';
import { ownedCount, type Organization } from '../api/organizations-api';
import { useCancelOrganizationRequest, useMyOrganizations } from '../hooks';

/** Profile › Organizasyonlarım (ADR-0030): the person's organizations and requests, and the way to ask for a new one. */
export function MyOrganizationsScreen() {
  const { t } = useTranslation(['profile', 'common']);
  const router = useRouter();
  const { spacing } = useTheme();
  const mine = useMyOrganizations();

  const header = (
    <ScreenHeader
      title={t('profile:organizations.title')}
      backLabel={t('common:back')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
    />
  );
  if (mine.isError) {
    return (
      <Screen maxWidth={560}>
        {header}
        <EmptyState
          title={t('profile:organizations.loadFailed')}
          body={errorText(mine.error)}
          actionLabel={t('common:retry')}
          onAction={() => void mine.refetch()}
        />
      </Screen>
    );
  }
  if (!mine.data) {
    return (
      <Screen maxWidth={560}>
        {header}
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <Skeleton height={120} radiusKey="lg" />
        </View>
      </Screen>
    );
  }
  const { items, maxOwned } = mine.data;
  const atLimit = ownedCount(items) >= maxOwned;

  return (
    <Screen maxWidth={560}>
      {header}
      <Text tone="secondary">{t('profile:organizations.intro')}</Text>
      {items.length === 0 ? (
        <Text tone="secondary">{t('profile:organizations.empty')}</Text>
      ) : (
        <View role="list" style={{ gap: spacing[3] }}>
          {items.map((organization) => (
            <View key={organization.id} role="listitem">
              <OrganizationRow organization={organization} />
            </View>
          ))}
        </View>
      )}
      {atLimit ? (
        <Text variant="caption" tone="secondary">
          {t('profile:organizations.limit', { count: maxOwned })}
        </Text>
      ) : (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={t('profile:organizations.create')}
            onPress={() => router.push('/organizations/new' as Href)}
          />
        </View>
      )}
    </Screen>
  );
}

function OrganizationRow({ organization }: { organization: Organization }) {
  const { t } = useTranslation(['profile', 'common']);
  const { colors, radius, spacing } = useTheme();
  const catalog = useCatalog();
  const cancel = useCancelOrganizationRequest();
  const [confirming, setConfirming] = useState(false);
  const locale = currentLocale();
  const city = catalog.data?.cities.find((c) => c.id === organization.cityId);
  const sports = (catalog.data?.sports ?? [])
    .filter((s) => organization.sportIds.includes(s.id))
    .map((s) => localizedName(s.names, locale));

  return (
    <View
      style={{
        gap: spacing[2],
        padding: spacing[3],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="titleSm">{organization.name}</Text>
      <Text variant="caption" tone="secondary">
        {[
          t(`profile:organizations.status.${organization.status}`),
          t(`profile:organizations.role.${organization.role}`),
          city ? localizedName(city.names, locale) : null,
          sports.join(', ') || null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {organization.status === 'PENDING' ? (
        <Text variant="caption" tone="secondary">
          {t('profile:organizations.pendingHint')}
        </Text>
      ) : null}
      {organization.status === 'REJECTED' && organization.rejectReason ? (
        <Banner
          kind="warning"
          message={t('profile:organizations.rejected', { reason: organization.rejectReason })}
        />
      ) : null}
      {cancel.isError ? <Banner kind="danger" message={errorText(cancel.error)} /> : null}
      {organization.status === 'PENDING' && organization.role === 'OWNER' ? (
        confirming ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              variant="destructive"
              label={t('profile:organizations.cancelYes')}
              loading={cancel.isPending}
              onPress={() => cancel.mutate(organization.id)}
            />
            <Button
              variant="secondary"
              label={t('profile:organizations.keep')}
              onPress={() => setConfirming(false)}
            />
          </View>
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              variant="tertiary"
              label={t('profile:organizations.cancel')}
              onPress={() => setConfirming(true)}
            />
          </View>
        )
      ) : null}
    </View>
  );
}
