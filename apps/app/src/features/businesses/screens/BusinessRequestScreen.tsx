import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '@/features/catalog';
import { CityPicker } from '@/features/events';
import { errorText } from '@/lib/error-text';
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
import {
  BUSINESS_MESSAGE_MAX,
  BUSINESS_NAME_MAX,
  BUSINESS_VENUES_MAX,
  type ClaimableVenue,
} from '../api/businesses-api';
import { ensureBusinessesCopy } from '../copy';
import { useClaimableVenues, useRequestBusiness } from '../hooks';

/**
 * The request for a business (ADR-0031): name, province, contact for the administrator, a message, and the commercial
 * venues it runs. An administrator decides; the server checks the same rules again.
 */
export function BusinessRequestScreen() {
  ensureBusinessesCopy();
  const { t } = useTranslation(['businesses', 'common']);
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const catalog = useCatalog();
  const send = useRequestBusiness();
  const [name, setName] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [venues, setVenues] = useState<ClaimableVenue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const found = useClaimableVenues(cityId, query);

  const header = (
    <ScreenHeader
      title={t('businesses:requestTitle')}
      backLabel={t('common:back')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/businesses' as Href))}
    />
  );
  if (catalog.isError) {
    return (
      <Screen maxWidth={560}>
        {header}
        <EmptyState
          title={errorText(catalog.error)}
          actionLabel={t('common:retry')}
          onAction={() => void catalog.refetch()}
        />
      </Screen>
    );
  }
  if (!catalog.data) {
    return (
      <Screen maxWidth={560}>
        {header}
        <Skeleton height={240} radiusKey="lg" />
      </Screen>
    );
  }

  const ready =
    name.trim().length >= 2 &&
    cityId !== null &&
    (phone.trim().length > 0 || email.trim().length > 0);
  const toggle = (venue: ClaimableVenue) =>
    setVenues((current) =>
      current.some((v) => v.id === venue.id)
        ? current.filter((v) => v.id !== venue.id)
        : current.length < BUSINESS_VENUES_MAX
          ? [...current, venue]
          : current,
    );
  const submit = () => {
    if (!ready || cityId === null) return;
    setError(null);
    // The screen goes away on success: navigate after the promise, not in a per-call onSuccess.
    void send
      .mutateAsync({
        name: name.trim(),
        cityId,
        contactPhone: phone.trim() || null,
        contactEmail: email.trim() || null,
        message: message.trim() || null,
        venueIds: venues.map((v) => v.id),
      })
      .then(() => {
        toast.show(t('businesses:sent'), 'success');
        router.replace('/businesses' as Href);
      })
      .catch((failure: unknown) => setError(errorText(failure)));
  };
  const shown = [
    ...venues,
    ...(found.data ?? []).filter((v) => !venues.some((chosen) => chosen.id === v.id)),
  ];

  return (
    <Screen maxWidth={560}>
      {header}
      <Text tone="secondary">{t('businesses:requestIntro')}</Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      <TextField
        label={t('businesses:name')}
        value={name}
        onChangeText={setName}
        maxLength={BUSINESS_NAME_MAX}
      />
      <View style={{ gap: spacing[2] }}>
        <Text variant="label">{t('businesses:city')}</Text>
        <CityPicker
          cities={catalog.data.cities}
          cityId={cityId}
          onChange={(id) => {
            setCityId(id);
            setVenues([]);
          }}
        />
      </View>
      <TextField
        label={t('businesses:phone')}
        hint={t('businesses:contactHint')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <TextField
        label={t('businesses:email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label={t('businesses:message')}
        hint={t('businesses:messageHint', { max: BUSINESS_MESSAGE_MAX })}
        value={message}
        onChangeText={setMessage}
        maxLength={BUSINESS_MESSAGE_MAX}
        multiline
      />
      {cityId ? (
        <View style={{ gap: spacing[2] }}>
          <TextField
            label={t('businesses:venueSearch')}
            hint={t('businesses:venueHint', { max: BUSINESS_VENUES_MAX })}
            value={query}
            onChangeText={setQuery}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {shown.map((venue) => (
              <ToggleChip
                key={venue.id}
                label={venue.name}
                selected={venues.some((v) => v.id === venue.id)}
                onPress={() => toggle(venue)}
              />
            ))}
          </View>
          {query.trim().length >= 2 && found.data?.length === 0 ? (
            <Text variant="caption" tone="secondary">
              {t('businesses:noVenue')}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Button
        label={t('businesses:send')}
        disabled={!ready}
        loading={send.isPending}
        loadingLabel={t('common:loading')}
        onPress={submit}
        fullWidth
      />
    </Screen>
  );
}
