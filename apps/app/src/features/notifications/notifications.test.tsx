import { AppError } from '@matchup/domain';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { AppNotification } from './api/notifications-api';
import { NotificationBell } from './NotificationBell';
import { NotificationsScreen } from './screens/NotificationsScreen';

const ME = '00000000-0000-4000-8000-0000000000aa';
const EVENT = '00000000-0000-4000-8000-0000000000e1';

const mockApi = {
  fetchNotifications: jest.fn(),
  fetchUnreadCount: jest.fn(),
  markNotificationsRead: jest.fn(),
  fetchMyAccount: jest.fn(),
};
jest.mock('./api/notifications-api', () => ({
  fetchNotifications: (...a: unknown[]) => mockApi.fetchNotifications(...a),
  fetchUnreadCount: (...a: unknown[]) => mockApi.fetchUnreadCount(...a),
  markNotificationsRead: (...a: unknown[]) => mockApi.markNotificationsRead(...a),
}));
jest.mock('@/features/onboarding/api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockApi.fetchMyAccount(...a),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  acceptCurrentLegalTerms: jest.fn(),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    usePathname: () => '/notifications',
    Redirect: ({ href }: { href: unknown }) => (
      <Text testID="redirect">{JSON.stringify(href)}</Text>
    ),
  };
});

const signedIn: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'a@example.com',
  emailVerified: true,
};

const note = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: '00000000-0000-4000-8000-000000000a01',
  type: 'REQUEST_APPROVED',
  eventId: EVENT,
  createdAt: '2026-11-01T10:00:00Z',
  read: false,
  eventTitle: 'Perşembe maçı',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchNotifications.mockResolvedValue([note()]);
  mockApi.fetchUnreadCount.mockResolvedValue(0);
  mockApi.markNotificationsRead.mockResolvedValue(undefined);
  mockApi.fetchMyAccount.mockResolvedValue({
    userId: ME,
    status: 'ACTIVE',
    emailVerified: true,
    adultConfirmed: true,
    onboarded: true,
    legalConsentCurrent: true,
    deletionDueAt: null,
  });
});

describe('NotificationsScreen', () => {
  it('tells good and bad news apart, in words and with an icon', async () => {
    mockApi.fetchNotifications.mockResolvedValue([
      note({ id: 'a', type: 'REQUEST_APPROVED' }),
      note({ id: 'b', type: 'REQUEST_REJECTED' }),
    ]);
    await renderApp(<NotificationsScreen />, { session: signedIn });
    expect(await screen.findByText(/isteğin onaylandı/)).toBeTruthy();
    expect(screen.getByText(/kabul edilmedi/)).toBeTruthy();
    expect(screen.getByTestId('icon-check', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('icon-alert', { includeHiddenElements: true })).toBeTruthy();
  });

  it('lists what happened in plain words, newest first, with the event title', async () => {
    mockApi.fetchNotifications.mockResolvedValue([
      note({ id: 'a', type: 'REQUEST_APPROVED' }),
      note({ id: 'b', type: 'JOIN_REQUESTED', read: true }),
    ]);
    await renderApp(<NotificationsScreen />, { session: signedIn });
    expect(await screen.findByText('Perşembe maçı için isteğin onaylandı.')).toBeTruthy();
    expect(screen.getByText('Perşembe maçı için yeni bir katılma isteği var.')).toBeTruthy();
    expect(screen.getAllByText('Yeni')).toHaveLength(1);
  });

  it('marks an item read and opens its event', async () => {
    await renderApp(<NotificationsScreen />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('link'));
    expect(mockApi.markNotificationsRead.mock.calls[0]?.[0]).toEqual([note().id]);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/e/[id]', params: { id: EVENT } });
  });

  it('does not mark an already read item again', async () => {
    mockApi.fetchNotifications.mockResolvedValue([note({ read: true })]);
    await renderApp(<NotificationsScreen />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('link'));
    expect(mockApi.markNotificationsRead).not.toHaveBeenCalled();
  });

  it('marks everything read in one tap, only while something is unread', async () => {
    await renderApp(<NotificationsScreen />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('button', { name: 'Tümünü okundu say' }));
    expect(mockApi.markNotificationsRead).toHaveBeenCalledTimes(1);
    expect(mockApi.markNotificationsRead.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('hides "mark all" when everything is read', async () => {
    mockApi.fetchNotifications.mockResolvedValue([note({ read: true })]);
    await renderApp(<NotificationsScreen />, { session: signedIn });
    await screen.findByText('Perşembe maçı için isteğin onaylandı.');
    expect(screen.queryByRole('button', { name: 'Tümünü okundu say' })).toBeNull();
  });

  it('falls back gracefully for an event that is gone and for a type from a newer app', async () => {
    mockApi.fetchNotifications.mockResolvedValue([
      note({ id: 'a', eventTitle: null }),
      note({ id: 'b', type: null, eventId: null }),
    ]);
    await renderApp(<NotificationsScreen />, { session: signedIn });
    expect(await screen.findByText('bir etkinlik için isteğin onaylandı.')).toBeTruthy();
    expect(screen.getByText('Yeni bir bildirimin var.')).toBeTruthy();
  });

  it('has honest empty and error states', async () => {
    mockApi.fetchNotifications.mockResolvedValueOnce([]);
    await renderApp(<NotificationsScreen />, { session: signedIn });
    expect(await screen.findByText('Bildirimin yok')).toBeTruthy();
  });

  it('shows a retryable error', async () => {
    mockApi.fetchNotifications.mockRejectedValueOnce(new AppError('RATE_LIMITED'));
    await renderApp(<NotificationsScreen />, { session: signedIn });
    expect(await screen.findByText('Bildirimler yüklenemedi')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Perşembe maçı için isteğin onaylandı.')).toBeTruthy();
  });

  it('asks the server nothing for a guest', async () => {
    await renderApp(<NotificationsScreen />, { session: { status: 'guest' } });
    expect(await screen.findByTestId('redirect')).toBeTruthy();
    expect(mockApi.fetchNotifications).not.toHaveBeenCalled();
  });
});

describe('NotificationBell', () => {
  it('shows the unread count and opens the inbox', async () => {
    mockApi.fetchUnreadCount.mockResolvedValue(3);
    await renderApp(<NotificationBell />, { session: signedIn });
    const bell = await screen.findByRole('button', { name: 'Bildirimler, 3 okunmamış' });
    await fireEvent.press(bell);
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
  });

  it('has a plain label when nothing is unread', async () => {
    await renderApp(<NotificationBell />, { session: signedIn });
    expect(await screen.findByRole('button', { name: 'Bildirimler' })).toBeTruthy();
  });

  it('does not exist for guests and never polls for them', async () => {
    await renderApp(<NotificationBell />, { session: { status: 'guest' } });
    expect(screen.queryByRole('button')).toBeNull();
    expect(mockApi.fetchUnreadCount).not.toHaveBeenCalled();
  });
});
