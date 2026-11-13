import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  EmptyState,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  TextField,
  ToggleChip,
  useTheme,
  useToast,
} from '@/ui';
import { BUSINESS_NAME_MAX, type OwnedBusiness, type OwnedVenue } from '../api/businesses-api';
import { ensureBusinessesCopy } from '../copy';
import {
  useMyBusiness,
  useStaffAction,
  useUpdateBusinessVenue,
  useUpdateMyBusiness,
} from '../hooks';

const VENUE_SPORTS_MAX = 10;

/**
 * The owner edits their active business (Phase 10 / M3, ADR-0031): its name and contact, and each venue's name, address
 * and sports. The place, the kind and verification stay with administrators; the server checks everything again.
 */
export function BusinessEditScreen() {
  ensureBusinessesCopy();
  const { t } = useTranslation(['businesses', 'common']);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useMyBusiness(id ?? '');
  const header = (
    <ScreenHeader
      title={business.data?.name ?? t('businesses:edit.title')}
      backLabel={t('common:back')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/businesses' as Href))}
    />
  );
  if (business.isError) {
    return (
      <Screen maxWidth={560}>
        {header}
        <EmptyState
          title={t('businesses:edit.unavailable')}
          body={errorText(business.error)}
          actionLabel={t('common:retry')}
          onAction={() => void business.refetch()}
        />
      </Screen>
    );
  }
  if (!business.data) {
    return (
      <Screen maxWidth={560}>
        {header}
        <Skeleton height={240} radiusKey="lg" />
      </Screen>
    );
  }
  return (
    <Screen maxWidth={560}>
      {header}
      {business.data.role === 'OWNER' ? <BusinessForm business={business.data} /> : null}
      {business.data.staff ? <StaffSection business={business.data} /> : null}
      <Text variant="title" heading={2}>
        {t('businesses:edit.venues')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('businesses:edit.venuesHint')}
      </Text>
      {business.data.venues.length === 0 ? (
        <Text tone="secondary">{t('businesses:edit.noVenues')}</Text>
      ) : (
        business.data.venues.map((venue) => (
          <VenueForm key={venue.id} businessId={business.data.id} venue={venue} />
        ))
      )}
    </Screen>
  );
}

function BusinessForm({ business }: { business: OwnedBusiness }) {
  const { t } = useTranslation(['businesses', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const save = useUpdateMyBusiness();
  const [name, setName] = useState(business.name);
  const [phone, setPhone] = useState(business.contactPhone ?? '');
  const [email, setEmail] = useState(business.contactEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length >= 2 && (phone.trim() !== '' || email.trim() !== '');
  return (
    <View style={{ gap: spacing[3] }}>
      {error ? <Banner kind="danger" message={error} /> : null}
      <TextField
        label={t('businesses:name')}
        value={name}
        onChangeText={setName}
        maxLength={BUSINESS_NAME_MAX}
      />
      <TextField
        label={t('businesses:phone')}
        hint={t('businesses:contactHint')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextField
        label={t('businesses:email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={t('businesses:edit.saveBusiness')}
          disabled={!ready}
          loading={save.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => {
            setError(null);
            save.mutate(
              {
                id: business.id,
                name: name.trim(),
                contactPhone: phone.trim() || null,
                contactEmail: email.trim() || null,
              },
              {
                onSuccess: () => toast.show(t('businesses:edit.saved'), 'success'),
                onError: (failure) => setError(errorText(failure)),
              },
            );
          }}
        />
      </View>
    </View>
  );
}

function VenueForm({ businessId, venue }: { businessId: string; venue: OwnedVenue }) {
  const { t } = useTranslation(['businesses', 'common']);
  const { colors, radius, spacing } = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const save = useUpdateBusinessVenue();
  const [name, setName] = useState(venue.name);
  const [address, setAddress] = useState(venue.addressText ?? '');
  const [sportIds, setSportIds] = useState<string[]>(venue.sportIds);
  const [error, setError] = useState<string | null>(null);
  const locale = currentLocale();
  const ready = name.trim().length >= 3 && sportIds.length > 0;
  return (
    <View
      style={{
        gap: spacing[3],
        padding: spacing[3],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="caption" tone="secondary">
        {t(venue.verified ? 'businesses:edit.verified' : 'businesses:edit.unverified')}
      </Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      <TextField
        label={t('businesses:edit.venueName')}
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <TextField
        label={t('businesses:edit.address')}
        value={address}
        onChangeText={setAddress}
        maxLength={300}
      />
      <Text variant="label">{t('businesses:edit.sports', { max: VENUE_SPORTS_MAX })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {(catalog.data?.sports ?? []).map((sport) => (
          <ToggleChip
            key={sport.id}
            label={localizedName(sport.names, locale)}
            selected={sportIds.includes(sport.id)}
            disabled={!sportIds.includes(sport.id) && sportIds.length >= VENUE_SPORTS_MAX}
            onPress={() =>
              setSportIds((current) =>
                current.includes(sport.id)
                  ? current.filter((s) => s !== sport.id)
                  : [...current, sport.id],
              )
            }
          />
        ))}
      </View>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          variant="secondary"
          label={t('businesses:edit.saveVenue')}
          disabled={!ready}
          loading={save.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => {
            setError(null);
            save.mutate(
              {
                businessId,
                venueId: venue.id,
                name: name.trim(),
                addressText: address.trim() || null,
                sportIds,
              },
              {
                onSuccess: () => toast.show(t('businesses:edit.saved'), 'success'),
                onError: (failure) => setError(errorText(failure)),
              },
            );
          }}
        />
      </View>
    </View>
  );
}

/** Phase 10 / M4: the owner's staff list; staff are invited from a player card. */
function StaffSection({ business }: { business: OwnedBusiness }) {
  const { t } = useTranslation(['businesses', 'common']);
  const { spacing } = useTheme();
  const act = useStaffAction(business.id);
  const staff = business.staff ?? [];
  return (
    <View style={{ gap: spacing[2] }}>
      <Text variant="title" heading={2}>
        {t('businesses:staff.title')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('businesses:staff.hint')}
      </Text>
      {act.isError ? <Banner kind="danger" message={errorText(act.error)} /> : null}
      {staff.length === 0 ? <Text tone="secondary">{t('businesses:staff.none')}</Text> : null}
      {staff.map((member) => (
        <View
          key={member.userId}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2] }}
        >
          <Text style={{ flexGrow: 1 }}>
            {member.displayName ?? t('businesses:staff.unnamed')}
            {member.status === 'INVITED' ? ` · ${t('businesses:staff.invitedState')}` : ''}
          </Text>
          <Button
            variant="tertiary"
            label={t(
              member.status === 'INVITED' ? 'businesses:staff.withdraw' : 'businesses:staff.remove',
            )}
            disabled={act.isPending}
            onPress={() => act.mutate({ kind: 'remove', userId: member.userId })}
          />
        </View>
      ))}
    </View>
  );
}
