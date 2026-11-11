/** The web has no push notifications in the MVP (ADR-0028): the settings say so, and nothing is registered. */
export const pushSupported = false;

export interface DeviceToken {
  token: string;
  platform: 'ios' | 'android';
}

export const requestPushToken = (): Promise<DeviceToken | null> => Promise.resolve(null);
export const currentPushToken = (): Promise<DeviceToken | null> => Promise.resolve(null);
export const pushBlockedByOs = (): Promise<boolean> => Promise.resolve(false);
export const onPushOpened =
  (_open: (push: { eventId: string | null; kind: string | null }) => void): (() => void) =>
  () =>
    undefined;
