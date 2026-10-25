import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireAuth, sanitizeReturnTo } from '@/features/auth';
import { errorText } from '@/lib/error-text';
import { profileValidationMessage } from '@/lib/profile-validation';
import { Banner, Button, Checkbox, EmptyState, Screen, Text, useTheme } from '@/ui';
import { destination } from '../destination';
import { useAcceptLegalTerms, useLegalVersions, useMyAccount } from '../hooks';

/**
 * Re-consent for onboarded users after new Terms/Privacy versions were published. Only the legal
 * acceptance is asked again: 18+ and marketing choices stand. Declining is possible: guest-readable
 * screens (Discover) stay open; the server blocks writes until acceptance (CONSENT_REQUIRED).
 */
export function ConsentUpdateScreen() {
  return (
    <RequireAuth>
      <ConsentUpdate />
    </RequireAuth>
  );
}

function ConsentUpdate() {
  const { t } = useTranslation(['onboarding', 'common']);
  const { spacing, colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const account = useMyAccount();
  const legal = useLegalVersions();
  const accept = useAcceptLegalTerms();

  const [accepted, setAccepted] = useState(false);
  const [missing, setMissing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const returnTo = destination(sanitizeReturnTo(params.returnTo));

  if (account.isPending || legal.isPending) {
    return (
      <Screen maxWidth={560}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  const loadError = account.error ?? legal.error;
  if (loadError || !account.data || !legal.data) {
    return (
      <Screen maxWidth={560}>
        <EmptyState
          title={t('onboarding:loadFailed')}
          body={errorText(loadError)}
          actionLabel={t('common:retry')}
          onAction={() => {
            void account.refetch();
            void legal.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!account.data.onboarded) {
    return <Redirect href={{ pathname: '/onboarding', params: { returnTo } }} />;
  }
  if (account.data.legalConsentCurrent) return <Redirect href={returnTo as '/'} />;

  const versions = legal.data;

  const submit = () => {
    if (!accepted) {
      setMissing(true);
      return;
    }
    setSubmitError(null);
    accept.mutate(versions, {
      onSuccess: () => router.replace(returnTo as '/'),
      onError: (error) => {
        setSubmitError(errorText(error));
        // The versions changed again while this screen was open: show the new ones for the retry.
        void legal.refetch();
        setAccepted(false);
      },
    });
  };

  return (
    <Screen maxWidth={560}>
      <Text variant="headline" heading={1}>
        {t('onboarding:reconsent.title')}
      </Text>
      <Text tone="secondary">{t('onboarding:reconsent.intro')}</Text>
      {versions.draft ? (
        <Banner kind="warning" message={t('onboarding:consent.draftNotice')} />
      ) : null}
      {submitError ? <Banner kind="danger" message={submitError} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Button
          variant="tertiary"
          label={t('onboarding:consent.termsLink')}
          onPress={() => router.push('/legal/terms')}
        />
        <Button
          variant="tertiary"
          label={t('onboarding:consent.privacyLink')}
          onPress={() => router.push('/legal/privacy')}
        />
      </View>
      <Checkbox
        label={t('onboarding:reconsent.accept')}
        checked={accepted}
        onChange={(next) => {
          setAccepted(next);
          if (next) setMissing(false);
        }}
        error={missing ? (profileValidationMessage('TERMS_REQUIRED') ?? undefined) : undefined}
      />

      <View style={{ flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' }}>
        <Button
          variant="secondary"
          label={t('onboarding:reconsent.later')}
          onPress={() => router.replace('/')}
        />
        <Button
          label={t('onboarding:reconsent.submit')}
          loading={accept.isPending}
          loadingLabel={t('onboarding:reconsent.submitting')}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}
