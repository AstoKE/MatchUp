import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, SegmentedChoice, Sheet, Text, TextField, useTheme, useToast } from '@/ui';
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  FEEDBACK_MIN,
  submitFeedback,
  type FeedbackKind,
} from './api/feedback-api';

/**
 * Requests, suggestions and complaints about the app (ROADMAP P-22). A complaint about a person or an event is a report,
 * made from their page: the form says so, because only reports reach moderation.
 */
export function FeedbackSheet({
  visible,
  context,
  onClose,
}: {
  visible: boolean;
  context: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(['profile', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const send = useMutation({
    mutationFn: (input: Parameters<typeof submitFeedback>[0]) => submitFeedback(input),
  });
  const [kind, setKind] = useState<FeedbackKind | ''>('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tooShort = body.trim().length < FEEDBACK_MIN;

  const submit = () => {
    if (kind === '' || tooShort) return;
    setError(null);
    // The sheet closes on success: the toast and reset run after the promise, not in a per-call onSuccess.
    void send
      .mutateAsync({ kind, body: body.trim(), context })
      .then(() => {
        setKind('');
        setBody('');
        toast.show(t('profile:feedback.sent'), 'success');
        onClose();
      })
      .catch((failure: unknown) => setError(errorText(failure)));
  };

  return (
    <Sheet
      visible={visible}
      title={t('profile:feedback.title')}
      onClose={onClose}
      closeLabel={t('common:cancel')}
      footer={
        <View style={{ gap: spacing[2] }}>
          <Button
            label={t('profile:feedback.send')}
            disabled={kind === '' || tooShort}
            loading={send.isPending}
            loadingLabel={t('common:loading')}
            onPress={submit}
            fullWidth
          />
          <Button variant="tertiary" label={t('common:cancel')} onPress={onClose} />
        </View>
      }
    >
      <View style={{ gap: spacing[4] }}>
        {error ? <Banner kind="danger" message={error} /> : null}
        <Text tone="secondary">{t('profile:feedback.intro')}</Text>
        <SegmentedChoice<FeedbackKind | ''>
          label={t('profile:feedback.kind')}
          value={kind}
          options={FEEDBACK_KINDS.map((value) => ({
            value,
            label: t(`profile:feedback.kinds.${value}`),
          }))}
          onChange={setKind}
        />
        {kind === 'COMPLAINT' ? (
          <Banner kind="info" message={t('profile:feedback.reportHint')} />
        ) : null}
        <TextField
          label={t('profile:feedback.body')}
          hint={t('profile:feedback.bodyHint', { min: FEEDBACK_MIN, max: FEEDBACK_MAX })}
          value={body}
          onChangeText={setBody}
          maxLength={FEEDBACK_MAX}
          multiline
        />
      </View>
    </Sheet>
  );
}
