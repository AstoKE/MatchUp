import { zodResolver } from '@hookform/resolvers/zod';
import { resetRequestSchema, type ResetRequestInput } from '@matchup/domain';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Banner, Button, TextField } from '@/ui';
import { resendVerificationEmail } from '../api/auth-api';
import { AuthFlowError, type AuthFailure } from '../api/classify-auth-error';
import { AuthLink } from '../components/AuthLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { getPendingEmail, setPendingEmail } from '../pending-email';
import { failureText, validationMessage } from '../validation-messages';

/** "Check your email" — shown after sign-up. Works after a reload too (asks for the address again). */
export function VerifyEmailScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const [pending, setPending] = useState<string | null>(getPendingEmail());
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetRequestInput>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: '' },
  });

  const resend = useMutation({
    mutationFn: resendVerificationEmail,
    onMutate: () => {
      setFailure(null);
      setSent(false);
    },
    onSuccess: (_data, email) => {
      setPendingEmail(email);
      setPending(email);
      setSent(true);
    },
    onError: (error) => setFailure(error instanceof AuthFlowError ? error.failure : 'UNKNOWN'),
  });

  const submit = handleSubmit(({ email }) => resend.mutate(email));

  return (
    <AuthScreenLayout
      title={t('auth:checkEmailTitle')}
      subtitle={
        pending ? t('auth:checkEmailBody', { email: pending }) : t('auth:checkEmailBodyGeneric')
      }
    >
      {failure ? <Banner kind="danger" message={failureText(failure)} /> : null}
      {sent ? <Banner kind="success" message={t('auth:resent')} /> : null}
      {pending ? (
        <Button
          variant="secondary"
          label={t('auth:resend')}
          loading={resend.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => resend.mutate(pending)}
          fullWidth
        />
      ) : (
        <>
          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label={t('auth:resendTo')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={validationMessage(errors.email?.message)}
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />
          <Button
            variant="secondary"
            label={t('auth:resend')}
            loading={resend.isPending}
            loadingLabel={t('common:loading')}
            onPress={() => void submit()}
            fullWidth
          />
        </>
      )}
      <AuthLink href="/sign-in" label={t('auth:backToSignIn')} />
    </AuthScreenLayout>
  );
}
