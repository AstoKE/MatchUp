import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Screen, ScreenHeader, Text, TextField, useTheme } from '@/ui';
import { useEnrollTotp, useVerifyTotp } from '../hooks';

function CodeForm({
  factorId,
  onBack,
  title,
  body,
  children,
}: {
  factorId: string;
  onBack: () => void;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const verify = useVerifyTotp();
  const [code, setCode] = useState('');
  const submit = () => verify.mutate({ factorId, code });
  return (
    <Screen maxWidth={480}>
      <ScreenHeader title={title} backLabel={t('common:back')} onBack={onBack} />
      <Text tone="secondary">{body}</Text>
      {children}
      <View style={{ gap: spacing[3] }}>
        {verify.isError ? <Banner kind="danger" message={t('admin:mfa.wrongCode')} /> : null}
        <TextField
          label={t('admin:mfa.code')}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          onSubmitEditing={submit}
        />
        <Button
          label={t('admin:mfa.verify')}
          loading={verify.isPending}
          loadingLabel={t('common:loading')}
          disabled={code.length !== 6}
          onPress={submit}
          fullWidth
        />
      </View>
    </Screen>
  );
}

/** First time: an authenticator is set up, then answered. Without it no administrator passes aal2 (S-14). */
export function MfaEnroll({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const enroll = useEnrollTotp();
  const { mutate } = enroll;
  useEffect(() => {
    mutate();
  }, [mutate]);

  if (enroll.isError) {
    return (
      <Screen maxWidth={480}>
        <ScreenHeader
          title={t('admin:mfa.enrollTitle')}
          backLabel={t('common:back')}
          onBack={onBack}
        />
        <Banner
          kind="danger"
          message={`${t('admin:mfa.setupFailed')} ${errorText(enroll.error)}`}
        />
        <Button label={t('common:retry')} onPress={() => mutate()} />
      </Screen>
    );
  }
  if (!enroll.data) {
    return (
      <Screen maxWidth={480}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')} />
      </Screen>
    );
  }
  return (
    <CodeForm
      factorId={enroll.data.factorId}
      onBack={onBack}
      title={t('admin:mfa.enrollTitle')}
      body={t('admin:mfa.enrollBody')}
    >
      <View style={{ gap: spacing[2], alignItems: 'flex-start' }}>
        <Image
          source={{ uri: enroll.data.qrCode }}
          accessibilityLabel={t('admin:mfa.qrAlt')}
          style={{ width: 192, height: 192 }}
        />
        <Text variant="caption" tone="secondary">
          {t('admin:mfa.secret')}
        </Text>
        <Text selectable variant="label" testID="totp-secret">
          {enroll.data.secret}
        </Text>
      </View>
    </CodeForm>
  );
}

/** Later visits: the code is asked for again, since a new sign-in starts at aal1. */
export function MfaChallenge({ factorId, onBack }: { factorId: string; onBack: () => void }) {
  const { t } = useTranslation('admin');
  return (
    <CodeForm
      factorId={factorId}
      onBack={onBack}
      title={t('mfa.challengeTitle')}
      body={t('mfa.challengeBody')}
    />
  );
}
