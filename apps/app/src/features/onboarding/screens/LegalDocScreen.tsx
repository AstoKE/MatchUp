import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Screen, Text, useTheme } from '@/ui';
import { useLegalVersions } from '../hooks';

const TERMS_SECTIONS = ['service', 'eligibility', 'conduct', 'risk', 'content', 'changes'] as const;
const PRIVACY_SECTIONS = ['collected', 'purpose', 'visibility', 'retention', 'rights'] as const;

/**
 * Terms of Use / Privacy Notice. The text is a DRAFT until counsel has reviewed it; the banner is
 * driven by `app_config legal.draft`, so removing it is a deliberate, versioned change (SECURITY §8).
 */
export function LegalDocScreen({ doc }: { doc: 'terms' | 'privacy' }) {
  const { t } = useTranslation('legal');
  const router = useRouter();
  const { spacing } = useTheme();
  const versions = useLegalVersions();
  const sections = doc === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const version = doc === 'terms' ? versions.data?.termsVersion : versions.data?.privacyVersion;
  // Unknown (still loading / offline) is shown as a draft too: the safe assumption until proven otherwise.
  const isDraft = versions.data?.draft ?? true;

  return (
    <Screen maxWidth={640}>
      {isDraft ? <Banner kind="warning" message={t('draftBanner')} /> : null}
      <Text variant="headline" heading={1}>
        {t(`${doc}.title`)}
      </Text>
      {version ? (
        <Text variant="caption" tone="secondary">
          {t('version', { version })}
        </Text>
      ) : null}
      {sections.map((section) => (
        <View key={section} style={{ gap: spacing[1] }}>
          <Text variant="title" heading={2}>
            {t(`${doc}.${section}.heading` as 'terms.service.heading')}
          </Text>
          <Text>{t(`${doc}.${section}.body` as 'terms.service.body')}</Text>
        </View>
      ))}
      <Button variant="secondary" label={t('back')} onPress={() => router.back()} />
    </Screen>
  );
}
