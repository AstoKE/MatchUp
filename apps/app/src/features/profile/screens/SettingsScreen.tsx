import type { ProfileVisibility, ThemePreference } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '@/features/settings';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  Checkbox,
  Screen,
  SegmentedChoice,
  Text,
  useSchemePreference,
  useTheme,
  useToast,
} from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { WithProfile } from '../components/WithProfile';
import { useSetMarketingConsent, useUpdateSettings } from '../hooks';

export function SettingsScreen() {
  return <WithProfile>{({ profile }) => <Settings profile={profile} />}</WithProfile>;
}

function Settings({ profile }: { profile: MyProfile }) {
  const { t } = useTranslation(['profile', 'common', 'auth']);
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const { preference, setPreference } = useSchemePreference();
  const updateSettings = useUpdateSettings();
  const marketing = useSetMarketingConsent();

  const [visibility, setVisibility] = useState<ProfileVisibility>(
    profile.settings.profileVisibility,
  );
  const [showReliability, setShowReliability] = useState(profile.settings.showReliability);
  const [showBadges, setShowBadges] = useState(profile.settings.showBadges);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    updateSettings.mutate(
      {
        // Language and theme apply on this device immediately; saving also records them on the account.
        locale: currentLocale(),
        theme: preference,
        profileVisibility: visibility,
        showReliability,
        showBadges,
      },
      {
        onSuccess: () => toast.show(t('profile:saved'), 'success'),
        onError: (failure) => setError(errorText(failure)),
      },
    );
  };

  return (
    <Screen maxWidth={560}>
      <Text variant="headline" heading={1}>
        {t('profile:settings.title')}
      </Text>
      {error ? <Banner kind="danger" message={error} /> : null}

      <Section title={t('profile:settings.privacy')}>
        <SegmentedChoice<ProfileVisibility>
          label={t('profile:settings.visibility')}
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'EVENT_PEERS', label: t('profile:settings.peers') },
            { value: 'EVERYONE', label: t('profile:settings.everyone') },
          ]}
        />
        <Text variant="caption" tone="secondary">
          {visibility === 'EVERYONE'
            ? t('profile:settings.helpEveryone')
            : t('profile:settings.helpPeers')}
        </Text>
        <Checkbox
          label={t('profile:settings.showReliability')}
          checked={showReliability}
          onChange={setShowReliability}
        />
        <Checkbox
          label={t('profile:settings.showBadges')}
          checked={showBadges}
          onChange={setShowBadges}
        />
      </Section>

      <Section title={t('profile:settings.appearance')}>
        <SegmentedChoice<ThemePreference>
          label={t('profile:settings.theme')}
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: t('profile:settings.themeSystem') },
            { value: 'light', label: t('profile:settings.themeLight') },
            { value: 'dark', label: t('profile:settings.themeDark') },
          ]}
        />
        <LanguagePicker />
      </Section>

      <View style={{ gap: spacing[2] }}>
        <Button
          label={t('common:save')}
          loading={updateSettings.isPending}
          loadingLabel={t('common:loading')}
          onPress={save}
          fullWidth
        />
      </View>

      <Section title={t('profile:settings.communication')}>
        <Checkbox
          label={t('profile:settings.marketing')}
          checked={profile.settings.marketingConsent}
          onChange={(granted) =>
            marketing.mutate(granted, {
              onSuccess: () => toast.show(t('profile:saved'), 'success'),
              onError: (failure) => setError(errorText(failure)),
            })
          }
        />
        <Text variant="caption" tone="secondary">
          {t('profile:settings.marketingHelp')}
        </Text>
      </Section>

      <Section title={t('profile:settings.legal')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <Button
            variant="secondary"
            label={t('profile:settings.terms')}
            onPress={() => router.push('/legal/terms')}
          />
          <Button
            variant="secondary"
            label={t('profile:settings.privacyNotice')}
            onPress={() => router.push('/legal/privacy')}
          />
        </View>
      </Section>

      <Button variant="tertiary" label={t('common:back')} onPress={() => router.back()} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text variant="title" heading={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}
