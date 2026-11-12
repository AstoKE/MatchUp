import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, SegmentedChoice, Sheet, TextField, useTheme, useToast } from '@/ui';
import { REPORT_REASONS, type ReportReason } from '../api/players-api';
import { useSendReport } from '../hooks';

const DETAILS_MAX = 1000;

/** The report form (USER_FLOWS FL-9): a reason and optional details. The reporter learns only that it arrived. */
export function ReportSheet({
  visible,
  targetType,
  targetId,
  inviteToken = null,
  onClose,
}: {
  visible: boolean;
  targetType: 'USER' | 'EVENT' | 'ORGANIZATION';
  targetId: string;
  inviteToken?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(['players', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const send = useSendReport();
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasons = REPORT_REASONS.filter((r) => targetType === 'EVENT' || r !== 'FAKE_EVENT');

  return (
    <Sheet
      visible={visible}
      title={t(
        targetType === 'EVENT'
          ? 'players:report.titleEvent'
          : targetType === 'ORGANIZATION'
            ? 'players:report.titleOrganization'
            : 'players:report.titleUser',
      )}
      onClose={onClose}
      closeLabel={t('common:cancel')}
      footer={
        <View style={{ gap: spacing[2] }}>
          <Button
            label={t('players:report.send')}
            disabled={reason === ''}
            loading={send.isPending}
            loadingLabel={t('common:loading')}
            onPress={() => {
              if (reason === '') return;
              setError(null);
              send.mutate(
                {
                  targetType,
                  targetId,
                  reason,
                  details: details.trim() || null,
                  inviteToken,
                },
                {
                  onSuccess: () => {
                    setReason('');
                    setDetails('');
                    toast.show(t('players:report.sent'), 'success');
                    onClose();
                  },
                  onError: (failure) => setError(errorText(failure)),
                },
              );
            }}
            fullWidth
          />
          <Button variant="tertiary" label={t('common:cancel')} onPress={onClose} />
        </View>
      }
    >
      <View style={{ gap: spacing[4] }}>
        {error ? <Banner kind="danger" message={error} /> : null}
        <SegmentedChoice<ReportReason | ''>
          label={t('players:report.reason')}
          value={reason}
          options={reasons.map((value) => ({ value, label: t(`players:report.reasons.${value}`) }))}
          onChange={setReason}
        />
        <TextField
          label={t('players:report.details')}
          hint={t('players:report.detailsHint', { max: DETAILS_MAX })}
          value={details}
          onChangeText={setDetails}
          maxLength={DETAILS_MAX}
          multiline
        />
      </View>
    </Sheet>
  );
}
