import { zodResolver } from '@hookform/resolvers/zod';
import { newPasswordSchema, PASSWORD_MIN_LENGTH, type NewPasswordInput } from '@matchup/domain';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Banner, Button, useToast } from '@/ui';
import { updatePassword } from '../api/auth-api';
import { AuthFlowError, type AuthFailure } from '../api/classify-auth-error';
import { AuthLink } from '../components/AuthLink';
import { AuthScreenLayout } from '../components/AuthScreenLayout';
import { PasswordField } from '../components/PasswordField';
import { useSession } from '../session';
import { failureText, validationMessage } from '../validation-messages';

/** Set a new password. Requires the recovery session created by the emailed link. */
export function ResetPasswordScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '' },
  });

  const update = useMutation({
    mutationFn: updatePassword,
    onMutate: () => setFailure(null),
    onSuccess: () => {
      toast.show(t('auth:passwordUpdated'), 'success');
      router.replace('/');
    },
    onError: (error) => setFailure(error instanceof AuthFlowError ? error.failure : 'UNKNOWN'),
  });

  if (session.status !== 'authenticated') {
    // No recovery session: the link was missing, expired or already used.
    return (
      <AuthScreenLayout title={t('auth:linkInvalidTitle')} subtitle={t('auth:linkInvalidBody')}>
        <AuthLink href="/forgot-password" label={t('auth:forgotPassword')} />
      </AuthScreenLayout>
    );
  }

  const submit = handleSubmit((values) => update.mutate(values));

  return (
    <AuthScreenLayout title={t('auth:updatePasswordTitle')}>
      {failure ? <Banner kind="danger" message={failureText(failure)} /> : null}
      <Controller
        control={control}
        name="password"
        render={({ field: { value, onChange, onBlur } }) => (
          <PasswordField
            label={t('auth:newPassword')}
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
        label={t('auth:updatePassword')}
        loading={update.isPending}
        loadingLabel={t('common:loading')}
        onPress={() => void submit()}
        fullWidth
      />
    </AuthScreenLayout>
  );
}
