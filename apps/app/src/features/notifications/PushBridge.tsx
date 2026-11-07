import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { useMyAccount } from '@/features/onboarding';
import { addBeforeSignOut } from '@/lib/before-sign-out';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Checkbox, Sheet, Text, useTheme, useToast } from '@/ui';
import { registerPushDevice, unregisterPushDevice } from './api/push-api';
import { currentPushToken, onPushOpened, pushSupported } from './push-device';
import { usePushSettings, useSavePushChoice } from './push-hooks';

/**
 * Mounted once at the root (Phase 8 / M4, ADR-0028): asks a person once about push notifications, keeps this device's
 * token registered while a kind is on, unregisters it at sign-out, and opens the event a tapped notification is about.
 * Nothing on the web.
 */
export function PushBridge() {
  return pushSupported ? <NativePushBridge /> : null;
}

// Screens where the question would interrupt: onboarding and the steps right after it, re-consent, deletion.
const NOT_HERE =
  /^\/(onboarding|avatar|verify-phone|consent-update|account-deletion|delete-account)(\/|$)/;

function NativePushBridge() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const account = useMyAccount();
  const settings = usePushSettings();
  const [answered, setAnswered] = useState(false);
  const userId = session.status === 'authenticated' ? session.userId : null;
  const wanted = settings.data ? settings.data.recommendations || settings.data.reminders : false;

  useEffect(
    () =>
      addBeforeSignOut(async () => {
        const device = await currentPushToken();
        if (device) await unregisterPushDevice(device.token);
      }),
    [],
  );

  // A token can change (reinstall, OS refresh): refresh it on each start while a kind is on.
  useEffect(() => {
    if (!userId || !wanted) return;
    void currentPushToken()
      .then((device) => (device ? registerPushDevice(device.token, device.platform) : undefined))
      .catch(() => undefined);
  }, [userId, wanted]);

  useEffect(
    () =>
      onPushOpened((eventId) => {
        if (eventId) router.push({ pathname: '/e/[id]', params: { id: eventId } });
      }),
    [router],
  );

  const ask =
    userId !== null &&
    !answered &&
    account.data?.onboarded === true &&
    account.data.status === 'ACTIVE' &&
    settings.data?.prompted === false &&
    !NOT_HERE.test(pathname);
  return ask ? <PushPrompt onDone={() => setAnswered(true)} /> : null;
}

/** The one-time question: both kinds off, the person turns on what they want, right here. */
export function PushPrompt({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(['notifications', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const save = useSavePushChoice();
  const [recommendations, setRecommendations] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = (choice: { recommendations: boolean; reminders: boolean }) => {
    setError(null);
    save
      .mutateAsync(choice)
      .then(({ deviceReady }) => {
        if (choice.recommendations || choice.reminders) {
          toast.show(
            deviceReady ? t('notifications:push.saved') : t('notifications:push.blocked'),
            deviceReady ? 'success' : 'info',
          );
        }
        onDone();
      })
      .catch((e: unknown) => setError(errorText(e)));
  };

  return (
    <Sheet
      visible
      title={t('notifications:push.promptTitle')}
      onClose={() => answer({ recommendations: false, reminders: false })}
      closeLabel={t('notifications:push.notNow')}
      footer={
        <View style={{ gap: spacing[2] }}>
          <Button
            label={t('common:save')}
            fullWidth
            loading={save.isPending}
            onPress={() => answer({ recommendations, reminders })}
          />
          <Button
            variant="tertiary"
            label={t('notifications:push.notNow')}
            disabled={save.isPending}
            onPress={() => answer({ recommendations: false, reminders: false })}
          />
        </View>
      }
    >
      <View style={{ gap: spacing[3] }}>
        <Text tone="secondary">{t('notifications:push.promptBody')}</Text>
        {error ? <Banner kind="danger" message={error} /> : null}
        <Checkbox
          label={t('notifications:push.recommendations')}
          checked={recommendations}
          onChange={setRecommendations}
        />
        <Checkbox
          label={t('notifications:push.reminders')}
          checked={reminders}
          onChange={setReminders}
        />
        <Text variant="caption" tone="secondary">
          {t('notifications:push.changeLater')}
        </Text>
      </View>
    </Sheet>
  );
}
