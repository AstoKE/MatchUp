import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, signUpSchema, type SignUpInput } from '@matchup/domain';
import { useMutation } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Banner, Button, TextField } from '@/ui';
import { signUpWithEmail } from '../api/auth-api';
import { AuthFlowError, type AuthFailure } from '../api/classify-auth-error';
import { AuthLink } from '../components/AuthLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { PasswordField } from '../components/PasswordField';
import { setPendingEmail } from '../pending-email';
import { useSession } from '../session';
import { failureText, validationMessage } from '../validation-messages';

export function SignUpScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const session = useSession();
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '' },
  });

  const signUp = useMutation({
    mutationFn: signUpWithEmail,
    onMutate: () => setFailure(null),
    // Same outcome for new and already-registered addresses (no account enumeration).
    onSuccess: (_data, variables) => {
      setPendingEmail(variables.email);
      router.replace('/verify-email');
    },
    onError: (error) => setFailure(error instanceof AuthFlowError ? error.failure : 'UNKNOWN'),
  });

  if (session.status === 'authenticated') return <Redirect href="/" />;

  const submit = handleSubmit((values) => signUp.mutate(values));

  return (
    <AuthScreenLayout title={t('auth:signUpTitle')}>
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
            hint={t('auth:passwordHint', { min: PASSWORD_MIN_LENGTH })}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={validationMessage(errors.password?.message)}
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      <Button
        label={t('auth:signUp')}
        loading={signUp.isPending}
        loadingLabel={t('common:loading')}
        onPress={() => void submit()}
        fullWidth
      />
      <AuthLink href="/sign-in" label={`${t('auth:haveAccount')} ${t('auth:signIn')}`} />
    </AuthScreenLayout>
  );
}
