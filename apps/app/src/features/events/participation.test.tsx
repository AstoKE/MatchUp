import { AppError } from '@matchup/domain';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { EventDetails } from './api/events-api';
import type { EventRequest } from './api/participation-api';
import { EventDetailScreen } from './screens/EventDetailScreen';

const SPORT = '00000000-0000-4000-8000-0000000000f1';
const F5 = '00000000-0000-4000-8000-0000000000f5';
const POSITION = '00000000-0000-4000-8000-0000000000b1';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const ME = '00000000-0000-4000-8000-0000000000aa';
const ORGANIZER = '00000000-0000-4000-8000-0000000000bb';

const catalog = {
  sports: [
    {
      id: SPORT,
      slug: 'football',
      names: { tr: 'Futbol', en: 'Football' },
      isTeamSport: true,
      skillDescriptors: {},
      positions: [{ id: POSITION, slug: 'goalkeeper', names: { tr: 'Kaleci', en: 'Goalkeeper' } }],
      formats: [
        {
          id: F5,
          slug: '5v5',
          names: { tr: '5v5', en: '5v5' },
          minParticipants: 10,
          defaultCapacity: 10,
          maxParticipants: 14,
        },
      ],
    },
  ],
  cities: [
    {
      id: ANKARA,
      slug: 'ankara',
      names: { tr: 'Ankara', en: 'Ankara' },
      timeZone: 'Europe/Istanbul',
      districts: [{ id: CANKAYA, slug: 'cankaya', names: { tr: 'Çankaya', en: 'Çankaya' } }],
    },
  ],
};

const mockApi = {
  fetchEvent: jest.fn(),
  fetchCatalog: jest.fn(),
  fetchMyAccount: jest.fn(),
  fetchMyParticipation: jest.fn(),
  requestJoin: jest.fn(),
  cancelParticipation: jest.fn(),
  decideParticipation: jest.fn(),
  fetchEventRequests: jest.fn(),
};
jest.mock('./api/events-api', () => ({
  fetchEvent: (...a: unknown[]) => mockApi.fetchEvent(...a),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  publishEvent: jest.fn(),
  cancelEvent: jest.fn(),
  completeEvent: jest.fn(),
  deleteDraft: jest.fn(),
}));
jest.mock('./api/participation-api', () => ({
  fetchMyParticipation: (...a: unknown[]) => mockApi.fetchMyParticipation(...a),
  requestJoin: (...a: unknown[]) => mockApi.requestJoin(...a),
  cancelParticipation: (...a: unknown[]) => mockApi.cancelParticipation(...a),
  decideParticipation: (...a: unknown[]) => mockApi.decideParticipation(...a),
  fetchEventRequests: (...a: unknown[]) => mockApi.fetchEventRequests(...a),
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
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: '00000000-0000-4000-8000-0000000000e1' }),
  usePathname: () => '/e/00000000-0000-4000-8000-0000000000e1',
}));

const player: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'p@example.com',
  emailVerified: true,
};
const organizer: SessionState = { ...player, userId: ORGANIZER };

function event(over: Partial<EventDetails> = {}): EventDetails {
  return {
    id: EVENT,
    organizerId: ORGANIZER,
    status: 'PUBLISHED',
    title: 'Perşembe maçı',
    description: null,
    sportId: SPORT,
    formatId: F5,
    visibility: 'PUBLIC',
    startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    durationMinutes: 90,
    endsAt: new Date(Date.now() + 3 * 86_400_000 + 5_400_000).toISOString(),
    cityId: ANKARA,
    districtId: CANKAYA,
    locationVisibility: 'PUBLIC',
    publicPlaceLabel: 'ODTÜ Halı Saha 2',
    capacity: 12,
    approvedCount: 1,
    waitlistEnabled: true,
    autoApprove: false,
    organizerPlays: true,
    skillMin: null,
    skillMax: null,
    bookingStatus: 'NOT_REQUIRED',
    costAmountMinor: null,
    costNote: null,
    setting: null,
    equipmentNote: null,
    cancelReason: null,
    cancelMessage: null,
    private: null,
    ...over,
  };
}
const mine = (status: string, requestCount = 1) => ({ status, requestCount, isOrganizer: false });
const request = (over: Partial<EventRequest> = {}): EventRequest => ({
  id: '00000000-0000-4000-8000-000000000c01',
  status: 'REQUESTED',
  displayName: 'Deniz D',
  level: 3.5,
  message: 'Orta saha oynarım',
  requestedAt: '2026-11-01T10:00:00Z',
  requestCount: 1,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.fetchEvent.mockResolvedValue(event());
  mockApi.fetchMyParticipation.mockResolvedValue(null);
  mockApi.fetchEventRequests.mockResolvedValue([]);
  mockApi.requestJoin.mockResolvedValue('REQUESTED');
  mockApi.cancelParticipation.mockResolvedValue(undefined);
  mockApi.decideParticipation.mockResolvedValue(undefined);
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

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const pressReady = async (name: string) =>
  fireEvent.press(await screen.findByRole('button', { name }));

describe('joining an event', () => {
  it('shows the indoor / outdoor row on the event page only when it was stated', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ setting: 'INDOOR' }));
    await renderApp(<EventDetailScreen />);
    expect((await screen.findAllByText('Kapalı salon')).length).toBeGreaterThan(0);
  });

  it('sends a guest to sign in and back to this event', async () => {
    await renderApp(<EventDetailScreen />);
    await pressReady('Giriş yap ve katıl');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: `/e/${EVENT}` },
    });
    expect(mockApi.fetchMyParticipation).not.toHaveBeenCalled();
  });

  it('sends the request with the message and shows what happens next', async () => {
    await renderApp(<EventDetailScreen />, { session: player });
    await pressReady('Katılma isteği gönder');
    expect(screen.getByText('Organizatör görünen adını ve seviyeni görecek.')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText('Organizatöre mesaj (isteğe bağlı)'),
      '  Orta saha oynarım ',
    );
    await press('İsteği gönder');
    expect(mockApi.requestJoin).toHaveBeenCalledWith({
      eventId: EVENT,
      message: 'Orta saha oynarım',
      positionId: null,
    });
    expect(
      await screen.findByText('İstek gönderildi. Organizatör onaylayınca haber vereceğiz.'),
    ).toBeTruthy();
  });

  it('passes the chosen position along', async () => {
    await renderApp(<EventDetailScreen />, { session: player });
    await pressReady('Katılma isteği gönder');
    await press(/^Tercih ettiğin pozisyon/);
    await fireEvent.press(screen.getByRole('radio', { name: 'Kaleci' }));
    await press('İsteği gönder');
    expect(mockApi.requestJoin).toHaveBeenCalledWith(
      expect.objectContaining({ positionId: POSITION }),
    );
  });

  it('says so when the event is full and offers the waitlist', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ approvedCount: 12 }));
    mockApi.requestJoin.mockResolvedValue('WAITLISTED');
    await renderApp(<EventDetailScreen />, { session: player });
    await pressReady('Etkinlik dolu, bekleme listesine katıl');
    await press('Etkinlik dolu, bekleme listesine katıl');
    expect(await screen.findByText('Etkinlik dolu. Bekleme listesine eklendin.')).toBeTruthy();
  });

  it('offers nothing when the event is full and has no waitlist', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ approvedCount: 12, waitlistEnabled: false }));
    await renderApp(<EventDetailScreen />, { session: player });
    expect(await screen.findAllByText('Etkinlik dolu.')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Katılma isteği|bekleme listesine/ })).toBeNull();
  });

  it('tells the player when a request is approved at once', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ autoApprove: true }));
    mockApi.requestJoin.mockResolvedValue('APPROVED');
    await renderApp(<EventDetailScreen />, { session: player });
    await pressReady('Katılma isteği gönder');
    expect(screen.getByText('Bu etkinlikte yer varsa isteğin hemen onaylanır.')).toBeTruthy();
    await press('İsteği gönder');
    expect(await screen.findByText('Katılımın onaylandı.')).toBeTruthy();
  });

  it('shows the server refusal in plain words', async () => {
    mockApi.requestJoin.mockRejectedValue(new AppError('REGISTRATION_CLOSED'));
    await renderApp(<EventDetailScreen />, { session: player });
    await pressReady('Katılma isteği gönder');
    await press('İsteği gönder');
    expect(await screen.findByText('Bu etkinliğin katılım kaydı kapandı.')).toBeTruthy();
  });

  it.each([
    ['REQUESTED', 'İstek gönderildi', 'İsteği geri çek'],
    ['WAITLISTED', 'Bekleme listesindesin', 'İsteği geri çek'],
    ['APPROVED', 'Onaylandın', 'Etkinlikten ayrıl'],
  ])('%s: shows the state and lets the player step back', async (status, label, action) => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine(status));
    await renderApp(<EventDetailScreen />, { session: player });
    expect(await screen.findByText(label)).toBeTruthy();
    await press(action);
    expect(mockApi.cancelParticipation).toHaveBeenCalledWith(EVENT);
  });

  it('gives no reason and no button after a refusal or a removal', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('REJECTED'));
    await renderApp(<EventDetailScreen />, { session: player });
    expect(await screen.findByText('Bu etkinliğe katılamazsın.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Katılma isteği|geri çek/ })).toBeNull();
  });

  it('stops offering the request after the third try', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('CANCELED', 3));
    await renderApp(<EventDetailScreen />, { session: player });
    expect(await screen.findByText('Bu etkinlik için istek hakkın doldu.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Katılma isteği gönder' })).toBeNull();
  });

  it('lets a player ask again after withdrawing (fewer than three tries)', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('CANCELED', 1));
    await renderApp(<EventDetailScreen />, { session: player });
    expect(await screen.findByRole('button', { name: 'Katılma isteği gönder' })).toBeTruthy();
  });

  it('does not offer joining on a canceled or already started event', async () => {
    mockApi.fetchEvent.mockResolvedValue(
      event({ status: 'CANCELED', cancelReason: 'WEATHER', cancelMessage: null }),
    );
    await renderApp(<EventDetailScreen />, { session: player });
    await screen.findByText('Perşembe maçı');
    expect(screen.queryByRole('button', { name: /Katılma isteği|Giriş yap ve katıl/ })).toBeNull();
  });
});

describe("the organizer's queue", () => {
  it('is not shown to players and the organizer does not see the join panel', async () => {
    await renderApp(<EventDetailScreen />, { session: organizer });
    await screen.findByText('Perşembe maçı');
    expect(screen.queryByRole('button', { name: /Katılma isteği/ })).toBeNull();
    expect(await screen.findByText('Henüz istek yok.')).toBeTruthy();
    expect(mockApi.fetchEventRequests).toHaveBeenCalledWith(EVENT);
  });

  it('never asks for the queue on behalf of a player', async () => {
    await renderApp(<EventDetailScreen />, { session: player });
    await screen.findByText('Perşembe maçı');
    expect(mockApi.fetchEventRequests).not.toHaveBeenCalled();
  });

  it('shows who asked and approves, declines or waitlists with one tap', async () => {
    mockApi.fetchEventRequests.mockResolvedValue([request()]);
    await renderApp(<EventDetailScreen />, { session: organizer });
    expect(await screen.findByText('Deniz D')).toBeTruthy();
    expect(screen.getByText('Seviye 3.5')).toBeTruthy();
    expect(screen.getByText('Orta saha oynarım')).toBeTruthy();
    await press('Onayla');
    expect(mockApi.decideParticipation).toHaveBeenLastCalledWith({
      participationId: request().id,
      decision: 'approve',
    });
    await press('Bekleme listesine al');
    expect(mockApi.decideParticipation).toHaveBeenLastCalledWith({
      participationId: request().id,
      decision: 'waitlist',
    });
    await press('Reddet');
    expect(mockApi.decideParticipation).toHaveBeenLastCalledWith({
      participationId: request().id,
      decision: 'reject',
    });
  });

  it('cannot approve beyond the capacity and says why', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ approvedCount: 12 }));
    mockApi.fetchEventRequests.mockResolvedValue([request()]);
    await renderApp(<EventDetailScreen />, { session: organizer });
    await screen.findByText('Deniz D');
    expect(screen.getByText('Etkinlik dolu: onaylamak için önce bir yer açılmalı.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Onayla', disabled: true })).toBeTruthy();
  });

  it('asks twice before removing an approved player', async () => {
    mockApi.fetchEventRequests.mockResolvedValue([request({ status: 'APPROVED' })]);
    await renderApp(<EventDetailScreen />, { session: organizer });
    await pressReady('Etkinlikten çıkar');
    expect(mockApi.decideParticipation).not.toHaveBeenCalled();
    expect(
      screen.getByText('Deniz D etkinlikten çıkarılsın mı? Bu işlem geri alınamaz.'),
    ).toBeTruthy();
    await press('Evet, çıkar');
    expect(mockApi.decideParticipation).toHaveBeenCalledWith({
      participationId: request().id,
      decision: 'remove',
    });
  });

  it('shows a server refusal on the queue', async () => {
    mockApi.fetchEventRequests.mockResolvedValue([request()]);
    mockApi.decideParticipation.mockRejectedValue(new AppError('EVENT_FULL'));
    await renderApp(<EventDetailScreen />, { session: organizer });
    await screen.findByText('Deniz D');
    await press('Onayla');
    expect(await screen.findByText('Etkinlik dolu.')).toBeTruthy();
  });
});
