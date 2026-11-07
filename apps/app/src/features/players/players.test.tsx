import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { PlayerCard } from './api/players-api';
import { BlockedList } from './components/BlockedList';
import { ReportSheet } from './components/ReportSheet';
import { PlayerCardScreen } from './screens/PlayerCardScreen';

const ME = '00000000-0000-4000-8000-0000000000aa';
const THEM = '00000000-0000-4000-8000-0000000000bb';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const FOOTBALL = '00000000-0000-4000-8000-000000000f01';

const mockApi = {
  fetchPlayerCard: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
  fetchMyBlocks: jest.fn(),
  sendReport: jest.fn(),
  fetchCatalog: jest.fn(),
  fetchMyAccount: jest.fn(),
};
jest.mock('./api/players-api', () => ({
  REPORT_REASONS: ['SPAM', 'HARASSMENT', 'UNSAFE', 'FAKE_EVENT', 'INAPPROPRIATE', 'OTHER'],
  fetchPlayerCard: (...a: unknown[]) => mockApi.fetchPlayerCard(...a),
  blockUser: (...a: unknown[]) => mockApi.blockUser(...a),
  unblockUser: (...a: unknown[]) => mockApi.unblockUser(...a),
  fetchMyBlocks: (...a: unknown[]) => mockApi.fetchMyBlocks(...a),
  sendReport: (...a: unknown[]) => mockApi.sendReport(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));
jest.mock('@/features/onboarding/api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockApi.fetchMyAccount(...a),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  acceptCurrentLegalTerms: jest.fn(),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    Link: jest.requireActual<typeof import('@/test/link-mock')>('@/test/link-mock').LinkMock,
    useLocalSearchParams: () => ({ id: '00000000-0000-4000-8000-0000000000bb' }),
    usePathname: () => '/u/x',
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{String(href)}</Text>,
  };
});

const session: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'a@example.com',
  emailVerified: true,
};
const card = (over: Partial<PlayerCard> = {}): PlayerCard => ({
  userId: THEM,
  displayName: 'Deniz Kaya',
  bio: 'Kaleci',
  isMe: false,
  sports: [{ sportId: FOOTBALL, level: 3.5, rating: 4.2 }],
  reliability: 0.92,
  xpTotal: 130,
  badges: [
    {
      code: 'FIRST_MATCH',
      sportId: null,
      names: { tr: 'İlk Maç', en: 'First Match' },
      descriptions: { tr: 'x', en: 'x' },
    },
  ],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchCatalog.mockResolvedValue({
    sports: [{ id: FOOTBALL, slug: 'football', names: { tr: 'Futbol', en: 'Football' } }],
    cities: [],
  });
  mockApi.fetchMyAccount.mockResolvedValue({
    userId: ME,
    status: 'ACTIVE',
    emailVerified: true,
    adultConfirmed: true,
    onboarded: true,
    legalConsentCurrent: true,
    deletionDueAt: null,
  });
  mockApi.blockUser.mockResolvedValue(undefined);
  mockApi.unblockUser.mockResolvedValue(undefined);
  mockApi.sendReport.mockResolvedValue(undefined);
  mockRouter.canGoBack.mockReturnValue(true);
});

describe('the player card', () => {
  it('shows what the player allows', async () => {
    mockApi.fetchPlayerCard.mockResolvedValue(card());
    await renderApp(<PlayerCardScreen />, { session });
    expect(await screen.findByRole('heading', { name: 'Deniz Kaya' })).toBeTruthy();
    expect(screen.getByText('Seviye 2')).toBeTruthy();
    expect(screen.getByText('%92')).toBeTruthy();
    expect(screen.getByText('Kendi tahmini 3,5 · Puan 4,2')).toBeTruthy();
    expect(screen.getByText('İlk Maç')).toBeTruthy();
    expect(screen.getByText(/oyuncu geri bildirimlerine dayanır/)).toBeTruthy();
  });

  it('leaves out what the server left out', async () => {
    mockApi.fetchPlayerCard.mockResolvedValue(
      card({ reliability: null, xpTotal: null, badges: [] }),
    );
    await renderApp(<PlayerCardScreen />, { session });
    await screen.findByRole('heading', { name: 'Deniz Kaya' });
    expect(screen.queryByText('Güvenilirlik')).toBeNull();
    expect(screen.queryByText('Rozetler')).toBeNull();
    expect(screen.queryByText(/^Seviye/)).toBeNull();
  });

  it('has no report or block on my own card', async () => {
    mockApi.fetchPlayerCard.mockResolvedValue(card({ isMe: true }));
    await renderApp(<PlayerCardScreen />, { session });
    await screen.findByRole('heading', { name: 'Deniz Kaya' });
    expect(screen.queryByRole('button', { name: 'Bildir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Engelle' })).toBeNull();
  });

  it('leaves even though the card would now answer not found', async () => {
    mockApi.fetchPlayerCard.mockResolvedValueOnce(card());
    mockApi.fetchPlayerCard.mockRejectedValue(new AppError('NOT_FOUND'));
    await renderApp(<PlayerCardScreen />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Engelle' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet, engelle' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockApi.fetchPlayerCard).toHaveBeenCalledTimes(1);
  });

  it('someone blocked, private or gone gets one answer', async () => {
    mockApi.fetchPlayerCard.mockRejectedValue(new AppError('NOT_FOUND'));
    await renderApp(<PlayerCardScreen />, { session });
    expect(await screen.findByText('Bu oyuncu görüntülenemiyor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Engelle' })).toBeNull();
  });

  it('asks before blocking, can step back, then blocks and leaves', async () => {
    mockApi.fetchPlayerCard.mockResolvedValue(card());
    await renderApp(<PlayerCardScreen />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Engelle' }));
    expect(mockApi.blockUser).not.toHaveBeenCalled();
    expect(screen.getByText(/Karşı tarafa bildirilmez/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Vazgeç' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Engelle' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet, engelle' }));
    await waitFor(() => expect(mockApi.blockUser.mock.calls[0]![0]).toBe(THEM));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });
});

describe('the report form', () => {
  const sheet = (targetType: 'USER' | 'EVENT') => (
    <ReportSheet
      visible
      targetType={targetType}
      targetId={EVENT}
      inviteToken="tok"
      onClose={onClose}
    />
  );
  const onClose = jest.fn();

  it('needs a reason, then sends it with trimmed details and closes', async () => {
    await renderApp(sheet('EVENT'), { session });
    await fireEvent.press(screen.getByText('Bildirimi gönder'));
    expect(mockApi.sendReport).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Sahte etkinlik' }));
    await fireEvent.changeText(screen.getByLabelText('Ayrıntılar (isteğe bağlı)'), '  Sahte  ');
    await fireEvent.press(await screen.findByText('Bildirimi gönder'));
    await waitFor(() =>
      expect(mockApi.sendReport.mock.calls[0]![0]).toEqual({
        targetType: 'EVENT',
        targetId: EVENT,
        reason: 'FAKE_EVENT',
        details: 'Sahte',
        inviteToken: 'tok',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('does not offer "fake event" about a person', async () => {
    await renderApp(sheet('USER'), { session });
    expect(screen.queryByRole('radio', { name: 'Sahte etkinlik' })).toBeNull();
  });

  it('stays open and explains a refusal', async () => {
    mockApi.sendReport.mockRejectedValue(new AppError('RATE_LIMITED'));
    await renderApp(sheet('USER'), { session });
    await fireEvent.press(screen.getByRole('radio', { name: 'Spam' }));
    await fireEvent.press(await screen.findByText('Bildirimi gönder'));
    expect(await screen.findByText(/Çok fazla işlem yaptın/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the blocked list', () => {
  it('says so when empty', async () => {
    mockApi.fetchMyBlocks.mockResolvedValue([]);
    await renderApp(<BlockedList />, { session });
    expect(await screen.findByText('Kimseyi engellemedin.')).toBeTruthy();
  });

  it('unblocks', async () => {
    mockApi.fetchMyBlocks.mockResolvedValue([{ userId: THEM, displayName: 'Deniz Kaya' }]);
    await renderApp(<BlockedList />, { session });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Deniz Kaya için engeli kaldır' }),
    );
    await waitFor(() => expect(mockApi.unblockUser.mock.calls[0]![0]).toBe(THEM));
  });

  it('offers a retry when loading fails', async () => {
    mockApi.fetchMyBlocks.mockRejectedValueOnce(new AppError('NETWORK'));
    mockApi.fetchMyBlocks.mockResolvedValue([]);
    await renderApp(<BlockedList />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Kimseyi engellemedin.')).toBeTruthy();
  });
});
