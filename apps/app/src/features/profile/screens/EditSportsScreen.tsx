import { sportListSchema, type SportSelection } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SportPicker, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { profileValidationMessage } from '@/lib/profile-validation';
import { Banner, Button, Screen, Text, useToast } from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { WithProfile } from '../components/WithProfile';
import { useReplaceSports } from '../hooks';

export function EditSportsScreen() {
  return <WithProfile>{(data) => <EditSports {...data} />}</WithProfile>;
}

function EditSports({ profile, catalog }: { profile: MyProfile; catalog: Catalog }) {
  const { t } = useTranslation(['profile', 'common']);
  const router = useRouter();
  const toast = useToast();
  const replace = useReplaceSports();
  const [sports, setSports] = useState<SportSelection[]>(profile.sports);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsed = sportListSchema.safeParse(sports);
    if (!parsed.success) {
      setError(profileValidationMessage(parsed.error.issues[0]?.message) ?? null);
      return;
    }
    setError(null);
    replace.mutate(parsed.data, {
      onSuccess: () => {
        toast.show(t('profile:saved'), 'success');
        router.back();
      },
      onError: (failure) => setError(errorText(failure)),
    });
  };

  return (
    <Screen maxWidth={560}>
      <Text variant="headline" heading={1}>
        {t('profile:editSportsTitle')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('profile:levelNote')}
      </Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      <SportPicker
        sports={catalog.sports}
        value={sports}
        onChange={(next) => {
          setSports(next);
          setError(null);
        }}
      />
      <Button
        label={t('common:save')}
        loading={replace.isPending}
        loadingLabel={t('common:loading')}
        onPress={save}
        fullWidth
      />
      <Button variant="tertiary" label={t('common:cancel')} onPress={() => router.back()} />
    </Screen>
  );
}
