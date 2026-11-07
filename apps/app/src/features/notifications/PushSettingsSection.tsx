import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Checkbox, Skeleton, Text, useTheme, useToast } from '@/ui';
import { pushBlockedByOs, pushSupported } from './push-device';
import { usePushSettings, useSavePushChoice, useSendTestPush } from './push-hooks';

/** Settings › Notifications: the two kinds (each saved at once), a test message, and a note when the phone refuses. */
export function PushSettingsSection() {
  const { t } = useTranslation(['notifications', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const settings = usePushSettings();
  const save = useSavePushChoice();
  const test = useSendTestPush();
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported) return;
    let current = true;
    void pushBlockedByOs().then((value) => {
      if (current) setBlocked(value);
    });
    return () => {
      current = false;
    };
  }, [settings.data]);

  if (!pushSupported) {
    return <Text tone="secondary">{t('notifications:push.webOnlyNote')}</Text>;
  }
  if (!settings.data) return <Skeleton height={120} radiusKey="md" />;
  const value = settings.data;

  const change = (choice: { recommendations: boolean; reminders: boolean }) => {
    setError(null);
    save
      .mutateAsync(choice)
      .then(({ deviceReady }) => {
        if (!deviceReady) setBlocked(true);
      })
      .catch((e: unknown) => setError(errorText(e)));
  };

  return (
    <View style={{ gap: spacing[3] }}>
      {error ? <Banner kind="danger" message={error} /> : null}
      {blocked && (value.recommendations || value.reminders) ? (
        <Banner kind="warning" message={t('notifications:push.blocked')} />
      ) : null}
      <Checkbox
        label={t('notifications:push.recommendations')}
        checked={value.recommendations}
        onChange={(recommendations) => change({ recommendations, reminders: value.reminders })}
      />
      <Checkbox
        label={t('notifications:push.reminders')}
        checked={value.reminders}
        onChange={(reminders) => change({ recommendations: value.recommendations, reminders })}
      />
      <Text variant="caption" tone="secondary">
        {t('notifications:push.help')}
      </Text>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          variant="secondary"
          label={t('notifications:push.test')}
          loading={test.isPending}
          loadingLabel={t('common:loading')}
          onPress={() => {
            setError(null);
            test
              .mutateAsync()
              .then((sent) =>
                toast.show(
                  sent ? t('notifications:push.testSent') : t('notifications:push.noDevice'),
                  sent ? 'success' : 'info',
                ),
              )
              .catch((e: unknown) => setError(errorText(e)));
          }}
        />
      </View>
    </View>
  );
}
