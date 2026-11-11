import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { SessionState } from '@/features/auth';
import { runBeforeSignOut } from '@/lib/before-sign-out';
import { renderApp } from '@/test/render';
import { PushBridge } from './PushBridge';
import { PushSettingsSection } from './PushSettingsSection';

const ME = '00000000-0000-4000-8000-0000000000aa';
const TOKEN = 'ExponentPushToken[abcdefghijkl]';

const mockApi = {
  fetchPushSettings: jest.fn(),
  setPushPreferences: jest.fn(),
  registerPushDevice: jest.fn(),
  unregisterPushDevice: jest.fn(),
  sendTestPush: jest.fn(),
  fetchMyAccount: jest.fn(),
};
jest.mock('./api/push-api', () => ({
  fetchPushSettings: (...a: unknown[]) => mockApi.fetchPushSettings(...a),
  setPushPreferences: (...a: unknown[]) => mockApi.setPushPreferences(...a),
  registerPushDevice: (...a: unknown[]) => mockApi.registerPushDevice(...a),
  unregisterPushDevice: (...a: unknown[]) => mockApi.unregisterPushDevice(...a),
  sendTestPush: (...a: unknown[]) => mockApi.sendTestPush(...a),
}));
jest.mock('@/features/onboarding/api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockApi.fetchMyAccount(...a),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  saveGenderAndAvatar: jest.fn(),
  acceptCurrentLegalTerms: jest.fn(),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
let mockPath = '/';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPath,
}));

const notifications = jest.mocked(Notifications);
const signedIn: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'a@example.com',
  emailVerified: true,
};
const settings = (over: Record<string, boolean> = {}) =>
  mockApi.fetchPushSettings.mockResolvedValue({
    recommendations: false,
    reminders: false,
    activity: true,
    prompted: false,
    ...over,
  });
const permission = (status: 'granted' | 'denied' | 'undetermined', canAskAgain = true) =>
  notifications.getPermissionsAsync.mockResolvedValue({ status, canAskAgain } as never);

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/';
  settings();
  mockApi.fetchMyAccount.mockResolvedValue({
    userId: ME,
    status: 'ACTIVE',
    emailVerified: true,
    isAdmin: false,
    adultConfirmed: true,
    onboarded: true,
    legalConsentCurrent: true,
    deletionDueAt: null,
  });
  for (const fn of [
    mockApi.setPushPreferences,
    mockApi.registerPushDevice,
    mockApi.unregisterPushDevice,
  ]) {
    fn.mockResolvedValue(undefined);
  }
  permission('undetermined');
  notifications.requestPermissionsAsync.mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
  } as never);
  notifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN });
});

describe('the one-time question', () => {
  it('asks an onboarded person once: "my events" on, the two promotional kinds off', async () => {
    await renderApp(<PushBridge />, { session: signedIn });
    expect(await screen.findByText('Bildirimler')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Etkinliklerim/, checked: true })).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: /Sana uygun etkinlikler/, checked: false }),
    ).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Hatırlatmalar/, checked: false })).toBeTruthy();
  });

  it('turning one on asks the phone, registers this device, then saves the choice', async () => {
    await renderApp(<PushBridge />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('checkbox', { name: /Sana uygun etkinlikler/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() =>
      expect(mockApi.setPushPreferences).toHaveBeenCalledWith({
        recommendations: true,
        reminders: false,
        activity: true,
      }),
    );
    expect(notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockApi.registerPushDevice).toHaveBeenCalledWith(TOKEN, 'ios');
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: expect.any(String),
    });
  });

  it('"not now" saves everything off and never asks the phone', async () => {
    await renderApp(<PushBridge />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('button', { name: 'Şimdi değil' }));
    await waitFor(() =>
      expect(mockApi.setPushPreferences).toHaveBeenCalledWith({
        recommendations: false,
        reminders: false,
        activity: false,
      }),
    );
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockApi.registerPushDevice).not.toHaveBeenCalled();
  });

  it('keeps the choice when the phone refuses, and says how to allow it', async () => {
    notifications.requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    } as never);
    await renderApp(<PushBridge />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('checkbox', { name: /Hatırlatmalar/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() =>
      expect(mockApi.setPushPreferences).toHaveBeenCalledWith({
        recommendations: false,
        reminders: true,
        activity: true,
      }),
    );
    expect(mockApi.registerPushDevice).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Telefonun bu uygulamanın bildirimlerine izin vermiyor/),
    ).toBeTruthy();
  });

  it('is not asked again once answered', async () => {
    settings({ prompted: true });
    await renderApp(<PushBridge />, { session: signedIn });
    await waitFor(() => expect(mockApi.fetchPushSettings).toHaveBeenCalled());
    expect(screen.queryByText('Bildirimler')).toBeNull();
  });

  it('is not asked during onboarding and the screens right after it', async () => {
    mockPath = '/avatar';
    await renderApp(<PushBridge />, { session: signedIn });
    await waitFor(() => expect(mockApi.fetchPushSettings).toHaveBeenCalled());
    expect(screen.queryByText('Bildirimler')).toBeNull();
  });

  it('is never asked of a guest', async () => {
    await renderApp(<PushBridge />);
    expect(screen.queryByText('Bildirimler')).toBeNull();
    expect(mockApi.fetchPushSettings).not.toHaveBeenCalled();
  });
});

describe('the device token', () => {
  it('is refreshed on start while a kind is on, and unregistered before signing out', async () => {
    settings({ prompted: true, recommendations: true });
    permission('granted');
    await renderApp(<PushBridge />, { session: signedIn });
    await waitFor(() => expect(mockApi.registerPushDevice).toHaveBeenCalledWith(TOKEN, 'ios'));
    await runBeforeSignOut();
    expect(mockApi.unregisterPushDevice).toHaveBeenCalledWith(TOKEN);
  });

  it('is registered while only "my events" is on', async () => {
    settings({ prompted: true, activity: true });
    permission('granted');
    await renderApp(<PushBridge />, { session: signedIn });
    await waitFor(() => expect(mockApi.registerPushDevice).toHaveBeenCalledWith(TOKEN, 'ios'));
  });

  it('opens the management screen for a new request (P-20)', async () => {
    settings({ prompted: true });
    notifications.getLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: { request: { content: { data: { event_id: 'e1', kind: 'JOIN_REQUEST' } } } },
    } as never);
    await renderApp(<PushBridge />, { session: signedIn });
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/e/[id]/manage',
        params: { id: 'e1' },
      }),
    );
  });

  it('opens the event a tapped notification is about', async () => {
    settings({ prompted: true });
    notifications.getLastNotificationResponseAsync.mockResolvedValueOnce({
      notification: { request: { content: { data: { event_id: 'e1' } } } },
    } as never);
    await renderApp(<PushBridge />, { session: signedIn });
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/e/[id]', params: { id: 'e1' } }),
    );
  });
});

describe('Settings › Notifications', () => {
  it('saves each kind at once; all off unregisters this device', async () => {
    settings({ prompted: true, recommendations: true, activity: false });
    permission('granted');
    await renderApp(<PushSettingsSection />, { session: signedIn });
    await fireEvent.press(
      await screen.findByRole('checkbox', { name: /Sana uygun etkinlikler/, checked: true }),
    );
    await waitFor(() =>
      expect(mockApi.setPushPreferences).toHaveBeenCalledWith({
        recommendations: false,
        reminders: false,
        activity: false,
      }),
    );
    expect(mockApi.unregisterPushDevice).toHaveBeenCalledWith(TOKEN);
  });

  it('"my events" is its own switch, saved with the others unchanged', async () => {
    settings({ prompted: true, recommendations: true });
    permission('granted');
    await renderApp(<PushSettingsSection />, { session: signedIn });
    await fireEvent.press(
      await screen.findByRole('checkbox', { name: /Etkinliklerim/, checked: true }),
    );
    await waitFor(() =>
      expect(mockApi.setPushPreferences).toHaveBeenCalledWith({
        recommendations: true,
        reminders: false,
        activity: false,
      }),
    );
    expect(mockApi.unregisterPushDevice).not.toHaveBeenCalled();
  });

  it('sends a test notification, or says the phone is not registered yet', async () => {
    settings({ prompted: true });
    mockApi.sendTestPush.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await renderApp(<PushSettingsSection />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('button', { name: 'Test bildirimi gönder' }));
    expect(await screen.findByText(/Test bildirimi gönderildi/)).toBeTruthy();
    expect(mockApi.registerPushDevice).toHaveBeenCalledWith(TOKEN, 'ios');
    await fireEvent.press(screen.getByRole('button', { name: 'Test bildirimi gönder' }));
    expect(await screen.findByText(/henüz kayıtlı değil/)).toBeTruthy();
  });
});
