import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  fetchPushSettings,
  registerPushDevice,
  sendTestPush,
  setPushConsents,
  unregisterPushDevice,
} from './api/push-api';
import { currentPushToken, requestPushToken } from './push-device';

const pushKey = (userId: string | null) => ['push-settings', userId] as const;

export function usePushSettings() {
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.userId : null;
  return useQuery({
    queryKey: pushKey(userId),
    queryFn: () => fetchPushSettings(userId as string),
    enabled: userId !== null,
  });
}

export interface SavedPushChoice {
  /** False when a kind was turned on but the phone refused notifications (or has no token, e.g. a simulator). */
  deviceReady: boolean;
}

/**
 * Saves both choices. Turning one on asks the OS for permission (only then) and registers this device; turning both off
 * unregisters it. The consents are saved either way: the person's choice is theirs, even if the phone says no for now.
 */
export function useSavePushChoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (choice: {
      recommendations: boolean;
      reminders: boolean;
    }): Promise<SavedPushChoice> => {
      let deviceReady = true;
      if (choice.recommendations || choice.reminders) {
        const device = await requestPushToken();
        if (device) await registerPushDevice(device.token, device.platform);
        else deviceReady = false;
      } else {
        const device = await currentPushToken();
        if (device) await unregisterPushDevice(device.token).catch(() => undefined);
      }
      await setPushConsents(choice);
      return { deviceReady };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['push-settings'] }),
  });
}

export function useSendTestPush() {
  return useMutation({
    mutationFn: async () => {
      // Make sure this device is registered (permission may have been given since).
      const device = await requestPushToken();
      if (device) await registerPushDevice(device.token, device.platform);
      return sendTestPush();
    },
  });
}
