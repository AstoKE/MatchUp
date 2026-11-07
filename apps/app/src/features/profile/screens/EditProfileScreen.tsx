import { BIO_MAX, profileEditSchema, type Gender } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocationFields, type Catalog } from '@/features/catalog';
import { GenderChoice } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { profileValidationMessage } from '@/lib/profile-validation';
import { Banner, Button, Screen, Text, TextField, useToast } from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { WithProfile } from '../components/WithProfile';
import { useMyAvatar, useSetGender } from '../avatar-hooks';
import { useUpdateProfile } from '../hooks';

export function EditProfileScreen() {
  return <WithProfile>{(data) => <EditForm {...data} />}</WithProfile>;
}

function EditForm({ profile, catalog }: { profile: MyProfile; catalog: Catalog }) {
  const { t } = useTranslation(['profile', 'common']);
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateProfile();
  const avatar = useMyAvatar();
  const setGender = useSetGender();
  // Undefined until the person touches it: an older account may have none yet (ADR-0027).
  const [gender, setGenderDraft] = useState<Gender | undefined>(undefined);
  const currentGender = gender ?? avatar.data?.gender ?? null;
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState({
    cityId: profile.cityId,
    districtId: profile.districtId,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const clear = (key: string) =>
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));

  const save = () => {
    const parsed = profileEditSchema.safeParse({ displayName: name, bio, ...location });
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) found[String(issue.path[0])] ??= issue.message;
      setErrors(found);
      return;
    }
    setErrors({});
    setSubmitError(null);
    update
      .mutateAsync(parsed.data)
      .then(() =>
        gender !== undefined && gender !== avatar.data?.gender
          ? setGender.mutateAsync(gender)
          : undefined,
      )
      .then(() => {
        toast.show(t('profile:saved'), 'success');
        router.back();
      })
      .catch((error: unknown) => setSubmitError(errorText(error)));
  };

  const message = (key: string | undefined) => profileValidationMessage(key);

  return (
    <Screen maxWidth={560}>
      <Text variant="headline" heading={1}>
        {t('profile:editProfileTitle')}
      </Text>
      {submitError ? <Banner kind="danger" message={submitError} /> : null}
      <TextField
        label={t('profile:displayName')}
        hint={t('profile:displayNameHint')}
        value={name}
        onChangeText={(value) => {
          setName(value);
          clear('displayName');
        }}
        error={message(errors.displayName)}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
      />
      <TextField
        label={t('profile:bio')}
        hint={t('profile:bioHint', { max: BIO_MAX })}
        value={bio}
        onChangeText={(value) => {
          setBio(value);
          clear('bio');
        }}
        error={message(errors.bio)}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <LocationFields
        cities={catalog.cities}
        cityId={location.cityId}
        districtId={location.districtId}
        onChange={(next) => {
          setLocation(next);
          clear('districtId');
        }}
        districtError={message(errors.districtId)}
      />
      <GenderChoice value={currentGender} onChange={setGenderDraft} />
      <Button
        label={t('common:save')}
        loading={update.isPending || setGender.isPending}
        loadingLabel={t('common:loading')}
        onPress={save}
        fullWidth
      />
      <Button variant="tertiary" label={t('common:cancel')} onPress={() => router.back()} />
    </Screen>
  );
}
