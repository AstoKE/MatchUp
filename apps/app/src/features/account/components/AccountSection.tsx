import { AppError } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Text, useTheme, useToast } from '@/ui';
import { useExportData } from '../hooks';

/** Settings › Account: download my data, delete my account (both first-class, SECURITY §8). */
export function AccountSection() {
  const { t } = useTranslation(['account', 'common']);
  const router = useRouter();
  const toast = useToast();
  const { spacing } = useTheme();
  const exportData = useExportData();
  const [error, setError] = useState<string | null>(null);

  const download = () => {
    setError(null);
    exportData.mutate(undefined, {
      onSuccess: () => toast.show(t('account:export.done'), 'success'),
      onError: (failure) =>
        setError(
          failure instanceof AppError && failure.code === 'RATE_LIMITED'
            ? t('account:export.rateLimited')
            : errorText(failure),
        ),
    });
  };

  return (
    <View style={{ gap: spacing[3] }}>
      <Text variant="title" heading={2}>
        {t('account:section')}
      </Text>
      {error ? <Banner kind="danger" message={error} /> : null}
      <Text variant="caption" tone="secondary">
        {t('account:export.help')}
      </Text>
      <Button
        variant="secondary"
        label={t('account:export.action')}
        loading={exportData.isPending}
        loadingLabel={t('account:export.preparing')}
        onPress={download}
      />
      <Text variant="caption" tone="secondary">
        {t('account:delete.help')}
      </Text>
      <Button
        variant="destructive"
        label={t('account:delete.action')}
        onPress={() => router.push('/delete-account')}
      />
    </View>
  );
}
