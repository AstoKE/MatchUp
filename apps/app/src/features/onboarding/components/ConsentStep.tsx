import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Checkbox, Text, useTheme } from '@/ui';

export interface ConsentDraft {
  adult: boolean;
  terms: boolean;
  marketing: boolean;
}

/**
 * Step 1: the 18+ confirmation and the Terms/Privacy acceptance are required; marketing is a
 * separate, optional, unbundled choice (KVKK: consent must be specific and freely given).
 */
export function ConsentStep({
  value,
  onChange,
  errors,
  draftNotice,
}: {
  value: ConsentDraft;
  onChange: (next: ConsentDraft) => void;
  errors: { adult?: string; terms?: string };
  draftNotice: boolean;
}) {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text variant="title" heading={2}>
        {t('consent.title')}
      </Text>
      <Text tone="secondary">{t('consent.intro')}</Text>
      {draftNotice ? <Banner kind="warning" message={t('consent.draftNotice')} /> : null}
      <Checkbox
        label={t('consent.adult')}
        checked={value.adult}
        onChange={(adult) => onChange({ ...value, adult })}
        error={errors.adult}
      />
      <Checkbox
        label={t('consent.terms')}
        checked={value.terms}
        onChange={(terms) => onChange({ ...value, terms })}
        error={errors.terms}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Button
          variant="tertiary"
          label={t('consent.termsLink')}
          onPress={() => router.push('/legal/terms')}
        />
        <Button
          variant="tertiary"
          label={t('consent.privacyLink')}
          onPress={() => router.push('/legal/privacy')}
        />
      </View>
      <Checkbox
        label={t('consent.marketing')}
        checked={value.marketing}
        onChange={(marketing) => onChange({ ...value, marketing })}
      />
    </View>
  );
}
