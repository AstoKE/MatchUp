import { AppError } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { authErrorText, PasswordField, useCaptcha } from '@/features/auth';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Screen, Text, useTheme } from '@/ui';
import { useRequestDeletion } from '../hooks';

/**
 * Explains exactly what happens, asks for the password again (the server checks that it was entered
 * in the last 10 minutes) and starts the 30-day grace period.
 */
export function DeleteAccountScreen() {
  return (
    <RequireOnboarded>
      <DeleteAccount />
    </RequireOnboarded>
  );
}

function DeleteAccount() {
  const { t } = useTranslation(['account', 'auth', 'common']);
  const router = useRouter();
  const { spacing } = useTheme();
  const request = useRequestDeletion();
  const captcha = useCaptcha();
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (password.length === 0) {
      setMissing(true);
      return;
    }
    const extra = captcha.take();
    if (!extra) return;
    setError(null);
    request.mutate(
      { password, ...extra },
      {
        onSuccess: () => router.replace('/account-deletion'),
        onError: (failure) =>
          setError(failure instanceof AppError ? errorText(failure) : authErrorText(failure)),
        onSettled: () => captcha.reset(),
      },
    );
  };

  return (
    <Screen maxWidth={560}>
      <Text variant="headline" heading={1}>
        {t('account:delete.title')}
      </Text>
      <View style={{ gap: spacing[2] }}>
        <Text>{t('account:delete.grace')}</Text>
        <Text>{t('account:delete.permanent')}</Text>
        <Text tone="secondary">{t('account:delete.kept')}</Text>
      </View>
      <Banner kind="warning" message={t('account:delete.exportFirst')} />
      {error ? <Banner kind="danger" message={error} /> : null}
      <PasswordField
        label={t('account:delete.password')}
        hint={t('account:delete.passwordHint')}
        value={password}
        onChangeText={(next) => {
          setPassword(next);
          if (next) setMissing(false);
        }}
        error={missing ? t('auth:validation.passwordRequired') : undefined}
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {captcha.widget}
      <View style={{ flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' }}>
        <Button variant="secondary" label={t('common:cancel')} onPress={() => router.back()} />
        <Button
          variant="destructive"
          label={t('account:delete.confirm')}
          loading={request.isPending}
          loadingLabel={t('common:loading')}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}
