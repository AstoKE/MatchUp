import { zodResolver } from '@hookform/resolvers/zod';
import { resetRequestSchema, type ResetRequestInput } from '@matchup/domain';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Banner, Button, TextField } from '@/ui';
import { requestPasswordReset } from '../api/auth-api';
import { AuthFlowError, type AuthFailure } from '../api/classify-auth-error';
import { useCaptcha } from '../captcha';
import { AuthLink } from '../components/AuthLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { failureText, validationMessage } from '../validation-messages';

export function ForgotPasswordScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetRequestInput>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: '' },
  });

  const captcha = useCaptcha();
  const request = useMutation({
    mutationFn: requestPasswordReset,
    onMutate: () => {
      setFailure(null);
      setDone(false);
    },
    // Identical message whether or not the address has an account (no enumeration).
    onSuccess: () => setDone(true),
    onError: (error) => setFailure(error instanceof AuthFlowError ? error.failure : 'UNKNOWN'),
    onSettled: () => captcha.reset(),
  });

  const submit = handleSubmit((values) => {
    const extra = captcha.take();
    if (extra) request.mutate({ ...values, ...extra });
  });

  return (
    <AuthScreenLayout title={t('auth:forgotPasswordTitle')} subtitle={t('auth:forgotPasswordBody')}>
      {failure ? <Banner kind="danger" message={failureText(failure)} /> : null}
      {done ? <Banner kind="success" message={t('auth:resetSent')} /> : null}
      <Controller
        control={control}
        name="email"
        render={({ field: { value, onChange, onBlur } }) => (
          <TextField
            label={t('auth:email')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={validationMessage(errors.email?.message)}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      {captcha.widget}
      <Button
        label={t('auth:sendResetLink')}
        loading={request.isPending}
        loadingLabel={t('common:loading')}
        onPress={() => void submit()}
        fullWidth
      />
      <AuthLink href="/sign-in" label={t('auth:backToSignIn')} />
    </AuthScreenLayout>
  );
}
