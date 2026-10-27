import { EVENT_CANCEL_REASONS, validateCancel, type EventCancelReason } from '@matchup/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Screen, Select, Text, TextField, useTheme, useToast } from '@/ui';
import { eventValidationMessage } from '../format';
import { useCancelEvent } from '../hooks';

export function CancelEventScreen() {
  return (
    <RequireOnboarded>
      <CancelEvent />
    </RequireOnboarded>
  );
}

function CancelEvent() {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const cancel = useCancelEvent();
  const [reason, setReason] = useState<EventCancelReason | null>(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validateCancel>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = () => {
    const found = validateCancel(reason, message);
    setErrors(found);
    if (!reason || Object.keys(found).length > 0) return;
    setSubmitError(null);
    cancel.mutate(
      { id, reason, message: message.trim() === '' ? null : message.trim() },
      {
        onSuccess: () => {
          toast.show(t('events:cancel.done'), 'success');
          // Back to the detail underneath (it refetches); a fresh one only after a deep link.
          if (router.canGoBack()) router.back();
          else router.replace({ pathname: '/e/[id]', params: { id } });
        },
        onError: (error) => setSubmitError(errorText(error)),
      },
    );
  };

  return (
    <Screen maxWidth={640}>
      <Text variant="headline" heading={1}>
        {t('events:cancel.title')}
      </Text>
      <Text>{t('events:cancel.body')}</Text>
      {submitError ? <Banner kind="danger" message={submitError} /> : null}
      <Select
        label={t('events:cancel.reason')}
        placeholder={t('events:cancel.reason')}
        value={reason}
        options={EVENT_CANCEL_REASONS.map((r) => ({
          value: r,
          label: t(`events:cancelReason.${r}`),
        }))}
        onChange={(value) => {
          setReason(EVENT_CANCEL_REASONS.find((r) => r === value) ?? null);
          setErrors((current) => ({ ...current, reason: undefined }));
        }}
        error={eventValidationMessage(errors.reason)}
      />
      <TextField
        label={t('events:cancel.message')}
        value={message}
        onChangeText={setMessage}
        error={eventValidationMessage(errors.message)}
        maxLength={500}
        multiline
      />
      <View style={{ gap: spacing[3] }}>
        <Button
          variant="destructive"
          label={t('events:cancel.confirm')}
          loading={cancel.isPending}
          loadingLabel={t('events:cancel.canceling')}
          onPress={submit}
          fullWidth
        />
        <Button variant="tertiary" label={t('common:back')} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
