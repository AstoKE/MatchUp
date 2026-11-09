import { maskTurkishMobile, type ProfileVisibility, type ThemePreference } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AccountSection } from '@/features/account';
import { useSession } from '@/features/auth';
import { PushSettingsSection } from '@/features/notifications';
import { BlockedList } from '@/features/players';
import { LanguagePicker, SupportContact } from '@/features/settings';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  Checkbox,
  Screen,
  ScreenHeader,
  SegmentedChoice,
  Text,
  useSchemePreference,
  useTheme,
  useToast,
} from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { WithProfile } from '../components/WithProfile';
import { useSetAnalyticsConsent, useSetMarketingConsent, useUpdateSettings } from '../hooks';

export function SettingsScreen() {
  return <WithProfile>{({ profile }) => <Settings profile={profile} />}</WithProfile>;
}

function Settings({ profile }: { profile: MyProfile }) {
  const { t } = useTranslation(['players', 'profile', 'common', 'auth', 'notifications']);
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const { preference, setPreference } = useSchemePreference();
  const updateSettings = useUpdateSettings();
  const marketing = useSetMarketingConsent();
  const analytics = useSetAnalyticsConsent();

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
      <ScreenHeader
        title={t('profile:settings.title')}
        backLabel={t('common:back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
      />
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
        <Text variant="caption" tone="secondary">
          {t('profile:settings.reliabilityHelp')}
        </Text>
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

      <Section title={t('profile:settings.analyticsTitle')}>
        {/* The explicit consent text is the label itself, so what is ticked is exactly what is agreed to. */}
        <Checkbox
          label={t('profile:settings.analyticsConsent')}
          checked={profile.settings.analyticsConsent}
          onChange={(granted) =>
            analytics.mutate(granted, {
              onSuccess: () =>
                toast.show(
                  t(granted ? 'profile:settings.analyticsOn' : 'profile:settings.analyticsOff'),
                  'success',
                ),
              onError: (failure) => setError(errorText(failure)),
            })
          }
        />
        <Text variant="caption" tone="secondary">
          {t('profile:settings.analyticsHelp')}
        </Text>
      </Section>

      <Section title={t('auth:phone.settingsTitle')}>
        <PhoneRow />
      </Section>

      <Section title={t('notifications:push.settingsTitle')}>
        <PushSettingsSection />
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

      <Section title={t('common:support.title')}>
        <SupportContact />
      </Section>

      <Section title={t('players:blocked.title')}>
        <BlockedList />
      </Section>

      <AccountSection />
    </Screen>
  );
}

/** Phase 8 (ADR-0029): the confirmed number, masked, and the way to verify or change it. */
function PhoneRow() {
  const { t } = useTranslation('auth');
  const { spacing } = useTheme();
  const router = useRouter();
  const session = useSession();
  const phone = session.status === 'authenticated' ? (session.phone ?? null) : null;
  return (
    <View style={{ gap: spacing[2], alignItems: 'flex-start' }}>
      <Text tone={phone ? 'primary' : 'secondary'}>
        {phone
          ? t('phone.settingsVerified', { number: maskTurkishMobile(phone) })
          : t('phone.settingsMissing')}
      </Text>
      <Button
        variant="secondary"
        label={phone ? t('phone.settingsChange') : t('phone.settingsVerify')}
        onPress={() =>
          router.push({ pathname: '/verify-phone', params: { returnTo: '/settings' } })
        }
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing[3],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="title" heading={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}
