import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { CityPicker } from '@/features/events';
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
import {
  ORGANIZATION_DESCRIPTION_MAX,
  ORGANIZATION_NAME_MAX,
  ORGANIZATION_SPORTS_MAX,
} from '../api/organizations-api';
import { useRequestOrganization } from '../hooks';

/**
 * The request for a new organization (ADR-0030): name, description, province and sports. It waits for an administrator;
 * the person is told when it is decided. The server checks the same rules again.
 */
export function OrganizationRequestScreen() {
  const { t } = useTranslation(['profile', 'common']);
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const catalog = useCatalog();
  const send = useRequestOrganization();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [sportIds, setSportIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const locale = currentLocale();
  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/organizations' as Href);

  const header = (
    <ScreenHeader
      title={t('profile:organizations.requestTitle')}
      backLabel={t('common:back')}
      onBack={back}
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

  const ready = name.trim().length >= 2 && cityId !== null && sportIds.length > 0;
  const toggle = (id: string) =>
    setSportIds((current) =>
      current.includes(id)
        ? current.filter((s) => s !== id)
        : current.length < ORGANIZATION_SPORTS_MAX
          ? [...current, id]
          : current,
    );
  const submit = () => {
    if (!ready || cityId === null) return;
    setError(null);
    // The screen goes away on success: navigate after the promise, not in a per-call onSuccess.
    void send
      .mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        cityId,
        sportIds,
      })
      .then(() => {
        toast.show(t('profile:organizations.sent'), 'success');
        router.replace('/organizations' as Href);
      })
      .catch((failure: unknown) => setError(errorText(failure)));
  };

  return (
    <Screen maxWidth={560}>
      {header}
      <Text tone="secondary">{t('profile:organizations.requestIntro')}</Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      <TextField
        label={t('profile:organizations.name')}
        hint={t('profile:organizations.nameHint')}
        value={name}
        onChangeText={setName}
        maxLength={ORGANIZATION_NAME_MAX}
      />
      <TextField
        label={t('profile:organizations.description')}
        hint={t('profile:organizations.descriptionHint', { max: ORGANIZATION_DESCRIPTION_MAX })}
        value={description}
        onChangeText={setDescription}
        maxLength={ORGANIZATION_DESCRIPTION_MAX}
        multiline
      />
      <View style={{ gap: spacing[2] }}>
        <Text variant="label">{t('profile:organizations.city')}</Text>
        <CityPicker cities={catalog.data.cities} cityId={cityId} onChange={setCityId} />
      </View>
      <View style={{ gap: spacing[2] }}>
        <Text variant="label">
          {t('profile:organizations.sports', { max: ORGANIZATION_SPORTS_MAX })}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {catalog.data.sports.map((sport) => (
            <ToggleChip
              key={sport.id}
              label={localizedName(sport.names, locale)}
              selected={sportIds.includes(sport.id)}
              disabled={!sportIds.includes(sport.id) && sportIds.length >= ORGANIZATION_SPORTS_MAX}
              onPress={() => toggle(sport.id)}
            />
          ))}
        </View>
      </View>
      <Button
        label={t('profile:organizations.send')}
        disabled={!ready}
        loading={send.isPending}
        loadingLabel={t('common:loading')}
        onPress={submit}
        fullWidth
      />
    </Screen>
  );
}
