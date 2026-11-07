import { brand } from '@matchup/config';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * The device side of push notifications (Phase 8 / M4, ADR-0028): permission, the Expo push token, and what a tap opens.
 * Native only; `push-device.web.ts` stands in on the web, which has no push in the MVP.
 */
export const pushSupported = true;

export interface DeviceToken {
  token: string;
  platform: 'ios' | 'android';
}

// A notification that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

const platform = (): 'ios' | 'android' => (Platform.OS === 'ios' ? 'ios' : 'android');

async function tokenOf(): Promise<DeviceToken | null> {
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: brand.identifiers.easProjectId,
    });
    return { token: data, platform: platform() };
  } catch {
    // Simulators and builds without push credentials have no token: no device is registered.
    return null;
  }
}

/** Asks the OS for permission if it has not been answered, then returns this device's token (null when refused). */
export async function requestPushToken(): Promise<DeviceToken | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      // eslint-disable-next-line import/namespace -- exported through a nested `export *` the rule cannot follow (tsc checks it)
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;
  return tokenOf();
}

/** This device's token when permission is already granted; never asks. */
export async function currentPushToken(): Promise<DeviceToken | null> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? tokenOf() : null;
}

/** Whether the OS refused notifications for the app (the person must change it in the phone's settings). */
export async function pushBlockedByOs(): Promise<boolean> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return status === 'denied' && !canAskAgain;
}

/** Calls back with the event id of a tapped notification (also the one that opened the app). Returns an unsubscribe. */
export function onPushOpened(open: (eventId: string | null) => void): () => void {
  const eventIdOf = (response: Notifications.NotificationResponse) => {
    const id = response.notification.request.content.data?.event_id;
    return typeof id === 'string' ? id : null;
  };
  void Notifications.getLastNotificationResponseAsync().then((last) => {
    if (last) open(eventIdOf(last));
  });
  const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
    open(eventIdOf(response)),
  );
  return () => subscription.remove();
}
