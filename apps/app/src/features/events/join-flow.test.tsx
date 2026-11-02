import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { EventDetails } from './api/events-api';
import { JoinRequestScreen } from './screens/JoinRequestScreen';
import { RequestStatusScreen } from './screens/RequestStatusScreen';

const SPORT = '00000000-0000-4000-8000-0000000000f1';
const F5 = '00000000-0000-4000-8000-0000000000f5';
const POSITION = '00000000-0000-4000-8000-0000000000b1';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';
const EVENT = '00000000-0000-4000-8000-0000000000e1';

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
  fetchMyParticipation: jest.fn(),
  requestJoin: jest.fn(),
};
jest.mock('./api/events-api', () => ({
  fetchEvent: (...a: unknown[]) => mockApi.fetchEvent(...a),
}));
jest.mock('./api/participation-api', () => ({
  fetchMyParticipation: (...a: unknown[]) => mockApi.fetchMyParticipation(...a),
  requestJoin: (...a: unknown[]) => mockApi.requestJoin(...a),
}));
jest.mock('./api/attendance-api', () => ({}));
jest.mock('./api/reviews-api', () => ({}));
jest.mock('./api/my-events-api', () => ({}));
jest.mock('./api/search-api', () => ({}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));

let mockInvite: string | undefined;
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: '00000000-0000-4000-8000-0000000000e1', invite: mockInvite }),
  usePathname: () => '/e/00000000-0000-4000-8000-0000000000e1/join',
}));

const player: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'p@example.com',
  emailVerified: true,
};

function event(over: Partial<EventDetails> = {}): EventDetails {
  return {
    id: EVENT,
    isOrganizer: false,
    organizerName: 'Ayşe A',
    inviteToken: null,
    participants: null,
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
const eventPage = { pathname: '/e/[id]', params: { id: EVENT } };

beforeEach(() => {
  jest.clearAllMocks();
  mockInvite = undefined;
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.fetchEvent.mockResolvedValue(event());
  mockApi.fetchMyParticipation.mockResolvedValue(null);
  mockApi.requestJoin.mockResolvedValue('REQUESTED');
});

describe('the request form', () => {
  it('summarizes the event, says approval is needed, and asks for no extra consent', async () => {
    await renderApp(<JoinRequestScreen />, { session: player });
    expect(await screen.findByRole('heading', { name: 'Katılım isteğini onayla' })).toBeTruthy();
    expect(screen.getByText('Perşembe maçı')).toBeTruthy();
    expect(screen.getByText('Çankaya · ODTÜ Halı Saha 2')).toBeTruthy();
    expect(screen.getByText('Organizatör onaylayana kadar yerin kesinleşmez.')).toBeTruthy();
    expect(
      screen.getByText('Organizatör görünen adını, seviyeni, puanını ve güvenilirliğini görecek.'),
    ).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('never shows a hidden place', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ publicPlaceLabel: null }));
    await renderApp(<JoinRequestScreen />, { session: player });
    expect(await screen.findByText('Çankaya · tam yer onaylananlara gösterilir')).toBeTruthy();
  });

  it('labels a stated cost as information, not an in-app charge', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ costAmountMinor: 15000 }));
    await renderApp(<JoinRequestScreen />, { session: player });
    expect(await screen.findByText(/üzerinden ödeme alınmaz/)).toBeTruthy();
  });

  it('sends the trimmed message and position, then asks the server for the outcome', async () => {
    await renderApp(<JoinRequestScreen />, { session: player });
    await fireEvent.changeText(
      await screen.findByLabelText('Organizatöre mesaj (isteğe bağlı)'),
      '  Orta saha oynarım ',
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Tercih ettiğin pozisyon/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Kaleci' }));
    await fireEvent.press(screen.getByRole('button', { name: 'İstek gönder' }));
    expect(mockApi.requestJoin.mock.calls[0]![0]).toEqual({
      eventId: EVENT,
      message: 'Orta saha oynarım',
      positionId: POSITION,
      inviteToken: null,
    });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/e/[id]/requested',
        params: { id: EVENT },
      }),
    );
  });

  it('goes to the status page even though the refreshed participation now says "already asked"', async () => {
    mockApi.fetchMyParticipation.mockResolvedValueOnce(null).mockResolvedValue(mine('REQUESTED'));
    await renderApp(<JoinRequestScreen />, { session: player });
    await fireEvent.press(await screen.findByRole('button', { name: 'İstek gönder' }));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/e/[id]/requested',
        params: { id: EVENT },
      }),
    );
    expect(mockRouter.replace).not.toHaveBeenCalledWith(eventPage);
  });

  it('carries the invite token through', async () => {
    mockInvite = 'tok';
    await renderApp(<JoinRequestScreen />, { session: player });
    await fireEvent.press(await screen.findByRole('button', { name: 'İstek gönder' }));
    expect(mockApi.fetchEvent.mock.calls[0]).toEqual([EVENT, 'tok']);
    expect(mockApi.requestJoin.mock.calls[0]![0]).toMatchObject({ inviteToken: 'tok' });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/e/[id]/requested',
        params: { id: EVENT, invite: 'tok' },
      }),
    );
  });

  it('a second tap while sending does nothing', async () => {
    let finish: (value: string) => void = () => undefined;
    mockApi.requestJoin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderApp(<JoinRequestScreen />, { session: player });
    await fireEvent.press(await screen.findByRole('button', { name: 'İstek gönder' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Yükleniyor…' }));
    expect(mockApi.requestJoin).toHaveBeenCalledTimes(1);
    finish('REQUESTED');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
  });

  it('stays and explains a refusal in plain words', async () => {
    mockApi.requestJoin.mockRejectedValue(new AppError('REGISTRATION_CLOSED'));
    await renderApp(<JoinRequestScreen />, { session: player });
    await fireEvent.press(await screen.findByRole('button', { name: 'İstek gönder' }));
    expect(await screen.findByText('Bu etkinliğin katılım kaydı kapandı.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('when full it is the waitlist, and says what that means', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ approvedCount: 12 }));
    await renderApp(<JoinRequestScreen />, { session: player });
    expect(await screen.findByRole('button', { name: 'Yedek listeye başvur' })).toBeTruthy();
    expect(screen.getByText(/Yer açılırsa organizatör karar verir/)).toBeTruthy();
  });

  it('an auto-approve event says so', async () => {
    mockApi.fetchEvent.mockResolvedValue(event({ autoApprove: true }));
    await renderApp(<JoinRequestScreen />, { session: player });
    expect(
      await screen.findByText('Bu etkinlikte yer varsa isteğin hemen onaylanır.'),
    ).toBeTruthy();
  });

  it('sends a guest to sign in and back here', async () => {
    await renderApp(<JoinRequestScreen />);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/sign-in',
        params: { returnTo: `/e/${EVENT}/join` },
      }),
    );
  });

  it.each<[string, Partial<EventDetails>, ReturnType<typeof mine> | null]>([
    ['the organizer', { isOrganizer: true }, null],
    ['a canceled event', { status: 'CANCELED' }, null],
    ['an event that has begun', { startsAt: new Date(Date.now() - 3_600_000).toISOString() }, null],
    ['a full event without a waitlist', { approvedCount: 12, waitlistEnabled: false }, null],
    ['someone who already asked', {}, mine('REQUESTED')],
    ['someone rejected', {}, mine('REJECTED')],
    ['someone out of attempts', {}, mine('CANCELED', 3)],
  ])('sends %s back to the event page', async (_name, over, participation) => {
    mockApi.fetchEvent.mockResolvedValue(event(over));
    mockApi.fetchMyParticipation.mockResolvedValue(participation);
    await renderApp(<JoinRequestScreen />, { session: player });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(eventPage));
    expect(screen.queryByRole('button', { name: 'İstek gönder' })).toBeNull();
  });

  it('someone who withdrew may ask again', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('CANCELED', 1));
    await renderApp(<JoinRequestScreen />, { session: player });
    expect(await screen.findByRole('button', { name: 'İstek gönder' })).toBeTruthy();
  });
});

describe('after the request', () => {
  it('pending: amber clock and honest words, never a confirmation', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('REQUESTED'));
    await renderApp(<RequestStatusScreen />, { session: player });
    expect(await screen.findByRole('heading', { name: 'İsteğin gönderildi' })).toBeTruthy();
    expect(screen.getByText('Organizatör onayladığında sana bildireceğiz.')).toBeTruthy();
    expect(screen.getByText('Onay bekleniyor')).toBeTruthy();
    expect(screen.getByTestId('icon-clock', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('icon-check', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText(/onaylandı/)).toBeNull();
  });

  it('waitlisted: its own words, not a confirmation', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('WAITLISTED'));
    await renderApp(<RequestStatusScreen />, { session: player });
    expect(await screen.findByRole('heading', { name: 'Yedek listeye başvurdun' })).toBeTruthy();
    expect(screen.queryByTestId('icon-check', { includeHiddenElements: true })).toBeNull();
  });

  it('green only when the server says approved', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('APPROVED'));
    await renderApp(<RequestStatusScreen />, { session: player });
    expect(await screen.findByRole('heading', { name: 'Katılımın onaylandı' })).toBeTruthy();
    expect(screen.getByTestId('icon-check', { includeHiddenElements: true })).toBeTruthy();
  });

  it.each(['REJECTED', 'CANCELED', 'REMOVED'])(
    '%s: nothing to show, back to the event',
    async (status) => {
      mockApi.fetchMyParticipation.mockResolvedValue(mine(status));
      await renderApp(<RequestStatusScreen />, { session: player });
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(eventPage));
      expect(screen.queryByRole('heading', { name: 'Katılımın onaylandı' })).toBeNull();
    },
  );

  it('no request at all (a typed URL): back to the event', async () => {
    await renderApp(<RequestStatusScreen />, { session: player });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(eventPage));
  });

  it('offers My Events and the event', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('REQUESTED'));
    await renderApp(<RequestStatusScreen />, { session: player });
    await fireEvent.press(await screen.findByRole('button', { name: 'Etkinliklerime git' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/my-events');
    await fireEvent.press(screen.getByRole('button', { name: 'Etkinliği görüntüle' }));
    expect(mockRouter.replace).toHaveBeenCalledWith(eventPage);
  });

  it('a failed load offers a retry, and no claim', async () => {
    mockApi.fetchMyParticipation.mockRejectedValueOnce(new AppError('NETWORK'));
    mockApi.fetchMyParticipation.mockResolvedValue(mine('REQUESTED'));
    await renderApp(<RequestStatusScreen />, { session: player });
    await fireEvent.press(await screen.findByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByRole('heading', { name: 'İsteğin gönderildi' })).toBeTruthy();
  });

  it('is available in English', async () => {
    mockApi.fetchMyParticipation.mockResolvedValue(mine('REQUESTED'));
    await renderApp(<RequestStatusScreen />, { session: player, locale: 'en' });
    expect(await screen.findByRole('heading', { name: 'Your request was sent' })).toBeTruthy();
  });
});
