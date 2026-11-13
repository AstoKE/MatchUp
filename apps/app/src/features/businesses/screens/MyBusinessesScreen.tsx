import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { Banner, Button, EmptyState, Screen, ScreenHeader, Skeleton, Text, useTheme } from '@/ui';
import { ownedCount, type Business } from '../api/businesses-api';
import { ensureBusinessesCopy } from '../copy';
import { useCancelBusinessRequest, useMyBusinesses, useStaffAction } from '../hooks';

/** Profile › İşletmelerim (ADR-0031): the person's businesses and requests, and the way to ask for a new one. */
export function MyBusinessesScreen() {
  ensureBusinessesCopy();
  const { t } = useTranslation(['businesses', 'common']);
  const router = useRouter();
  const { spacing } = useTheme();
  const mine = useMyBusinesses();

  const header = (
    <ScreenHeader
      title={t('businesses:title')}
      backLabel={t('common:back')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
    />
  );
  if (mine.isError) {
    return (
      <Screen maxWidth={560}>
        {header}
        <EmptyState
          title={t('businesses:loadFailed')}
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
      <Text tone="secondary">{t('businesses:intro')}</Text>
      {items.length === 0 ? (
        <Text tone="secondary">{t('businesses:empty')}</Text>
      ) : (
        <View role="list" style={{ gap: spacing[3] }}>
          {items.map((business) => (
            <View key={business.id} role="listitem">
              <BusinessRow business={business} />
            </View>
          ))}
        </View>
      )}
      {atLimit ? (
        <Text variant="caption" tone="secondary">
          {t('businesses:limit', { count: maxOwned })}
        </Text>
      ) : (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={t('businesses:create')}
            onPress={() => router.push('/businesses/new' as Href)}
          />
        </View>
      )}
    </Screen>
  );
}

function BusinessRow({ business }: { business: Business }) {
  const { t } = useTranslation(['businesses', 'common']);
  const { colors, radius, spacing } = useTheme();
  const catalog = useCatalog();
  const router = useRouter();
  const cancel = useCancelBusinessRequest();
  const [confirming, setConfirming] = useState(false);
  const city = catalog.data?.cities.find((c) => c.id === business.cityId);
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
      <Text variant="titleSm">{business.name}</Text>
      <Text variant="caption" tone="secondary">
        {[
          business.membership === 'INVITED'
            ? t('businesses:staff.invitedState')
            : t(`businesses:status.${business.status}`),
          business.role === 'STAFF' && business.membership === 'ACTIVE'
            ? t('businesses:staff.role')
            : null,
          city ? localizedName(city.names, currentLocale()) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {business.venues.length > 0 ? (
        <Text variant="bodySm">
          {t('businesses:venues', { names: business.venues.map((v) => v.name).join(', ') })}
        </Text>
      ) : null}
      {business.membership === 'INVITED' ? <StaffInvitation businessId={business.id} /> : null}
      {business.status === 'ACTIVE' &&
      business.role === 'STAFF' &&
      business.membership === 'ACTIVE' ? (
        <StaffActions businessId={business.id} name={business.name} />
      ) : null}
      {business.status === 'ACTIVE' && business.role === 'OWNER' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            variant="secondary"
            label={t('businesses:edit.open')}
            onPress={() =>
              router.push({ pathname: '/businesses/[id]', params: { id: business.id } } as Href)
            }
          />
        </View>
      ) : null}
      {business.status === 'PENDING' ? (
        <Text variant="caption" tone="secondary">
          {t('businesses:pendingHint')}
        </Text>
      ) : null}
      {business.status === 'REJECTED' && business.rejectReason ? (
        <Banner
          kind="warning"
          message={t('businesses:rejected', { reason: business.rejectReason })}
        />
      ) : null}
      {cancel.isError ? <Banner kind="danger" message={errorText(cancel.error)} /> : null}
      {business.status === 'PENDING' && business.role === 'OWNER' ? (
        confirming ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              variant="destructive"
              label={t('businesses:cancelYes')}
              loading={cancel.isPending}
              onPress={() => cancel.mutate(business.id)}
            />
            <Button
              variant="secondary"
              label={t('businesses:keep')}
              onPress={() => setConfirming(false)}
            />
          </View>
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              variant="tertiary"
              label={t('businesses:cancel')}
              onPress={() => setConfirming(true)}
            />
          </View>
        )
      ) : null}
    </View>
  );
}

/** Phase 10 / M4: an invitation to work at a business. */
function StaffInvitation({ businessId }: { businessId: string }) {
  const { t } = useTranslation(['businesses', 'common']);
  const { spacing } = useTheme();
  const act = useStaffAction(businessId);
  return (
    <View style={{ gap: spacing[2] }}>
      <Text variant="label">{t('businesses:staff.invited')}</Text>
      {act.isError ? <Banner kind="danger" message={errorText(act.error)} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Button
          label={t('businesses:staff.accept')}
          disabled={act.isPending}
          onPress={() => act.mutate({ kind: 'respond', accept: true })}
        />
        <Button
          variant="secondary"
          label={t('businesses:staff.decline')}
          disabled={act.isPending}
          onPress={() => act.mutate({ kind: 'respond', accept: false })}
        />
      </View>
    </View>
  );
}

/** Phase 10 / M4: a staff member edits the facilities, or leaves (after asking). */
function StaffActions({ businessId, name }: { businessId: string; name: string }) {
  const { t } = useTranslation(['businesses', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const act = useStaffAction(businessId);
  const [leaving, setLeaving] = useState(false);
  return (
    <View style={{ gap: spacing[2] }}>
      {act.isError ? <Banner kind="danger" message={errorText(act.error)} /> : null}
      {leaving ? (
        <View style={{ gap: spacing[2] }}>
          <Text role="alert">{t('businesses:staff.leaveConfirm', { name })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              variant="destructive"
              label={t('businesses:staff.leaveYes')}
              disabled={act.isPending}
              onPress={() => act.mutate({ kind: 'leave' })}
            />
            <Button
              variant="secondary"
              label={t('businesses:keep')}
              onPress={() => setLeaving(false)}
            />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <Button
            variant="secondary"
            label={t('businesses:staff.editVenues')}
            onPress={() =>
              router.push({ pathname: '/businesses/[id]', params: { id: businessId } } as Href)
            }
          />
          <Button
            variant="tertiary"
            label={t('businesses:staff.leave')}
            onPress={() => setLeaving(true)}
          />
        </View>
      )}
    </View>
  );
}
