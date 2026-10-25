import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@matchup/domain';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Banner, Button, TextField } from '@/ui';
import { AuthFlowError, type AuthFailure } from '../api/classify-auth-error';
import { signInWithEmail } from '../api/auth-api';
import { useCaptcha } from '../captcha';
import { AuthLink } from '../components/AuthLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { PasswordField } from '../components/PasswordField';
import { sanitizeReturnTo } from '../returnTo';
import { useSession } from '../session';
import { failureText, validationMessage } from '../validation-messages';

export function SignInScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const session = useSession();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = sanitizeReturnTo(params.returnTo) as Href;
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const captcha = useCaptcha();
  const signIn = useMutation({
    mutationFn: signInWithEmail,
    onMutate: () => setFailure(null),
    onSuccess: () => router.replace(returnTo),
    onError: (error) => setFailure(error instanceof AuthFlowError ? error.failure : 'UNKNOWN'),
    onSettled: () => captcha.reset(),
  });

  if (session.status === 'authenticated') return <Redirect href={returnTo} />;

  const submit = handleSubmit((values) => {
    const extra = captcha.take();
    if (extra) signIn.mutate({ ...values, ...extra });
  });

  return (
    <AuthScreenLayout title={t('auth:signInTitle')}>
      {failure ? <Banner kind="danger" message={failureText(failure)} /> : null}
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
            spellCheck={false}
            returnKeyType="next"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { value, onChange, onBlur } }) => (
          <PasswordField
            label={t('auth:password')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={validationMessage(errors.password?.message)}
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      {captcha.widget}
      <Button
        label={t('auth:signIn')}
        loading={signIn.isPending}
        loadingLabel={t('common:loading')}
        onPress={() => void submit()}
        fullWidth
      />
      <AuthLink href="/forgot-password" label={t('auth:forgotPassword')} />
      <AuthLink href="/sign-up" label={`${t('auth:noAccount')} ${t('auth:signUp')}`} />
    </AuthScreenLayout>
  );
}
