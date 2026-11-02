import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { EventListItem, EventListPage } from './api/search-api';
import { DiscoverScreen } from './screens/DiscoverScreen';

const SPORT = '00000000-0000-4000-8000-0000000000f1';
const TENNIS = '00000000-0000-4000-8000-0000000000f2';
const F5 = '00000000-0000-4000-8000-0000000000f5';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';

const catalog = {
  sports: [
    {
      id: SPORT,
      slug: 'football',
      names: { tr: 'Futbol', en: 'Football' },
      isTeamSport: true,
      skillDescriptors: {},
      positions: [],
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
    {
      id: TENNIS,
      slug: 'tennis',
      names: { tr: 'Tenis', en: 'Tennis' },
      isTeamSport: false,
      skillDescriptors: {},
      positions: [],
      formats: [],
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

const mockApi = { searchEvents: jest.fn(), fetchCatalog: jest.fn(), fetchMyProfile: jest.fn() };
jest.mock('./api/search-api', () => ({
  ...jest.requireActual<typeof import('./api/search-api')>('./api/search-api'),
  searchEvents: (...a: unknown[]) => mockApi.searchEvents(...a),
}));
jest.mock('@/features/profile/api/profile-api', () => ({
  fetchMyProfile: (...a: unknown[]) => mockApi.fetchMyProfile(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));

const mockPreference = { stored: 'ALL' as string | null, store: jest.fn() };
jest.mock('./discover-sport-preference', () => ({
  ALL_SPORTS: 'ALL',
  readDiscoverSport: () => Promise.resolve(mockPreference.stored),
  storeDiscoverSport: (...a: unknown[]) => mockPreference.store(...a),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
}));

function item(over: Partial<EventListItem> = {}): EventListItem {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    title: 'Perşembe maçı',
    sportId: SPORT,
    formatId: F5,
    // 19:30 in Istanbul (UTC+3).
    startsAt: '2026-11-05T16:30:00+00:00',
    durationMinutes: 90,
    cityId: ANKARA,
    districtId: CANKAYA,
    placeLabel: 'ODTÜ Halı Saha 2',
    capacity: 12,
    approvedCount: 4,
    openSlots: 8,
    registrationOpen: true,
    waitlistEnabled: true,
    skillMin: null,
    skillMax: null,
    costAmountMinor: null,
    costNote: null,
    setting: null,
    organizerName: 'Ayşe A',
    ...over,
  };
}
const page = (items: EventListItem[], nextCursor: EventListPage['nextCursor'] = null) => ({
  items,
  nextCursor,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPreference.stored = 'ALL';
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.searchEvents.mockResolvedValue(page([item()]));
});

/** The less frequent filters (time of day, setting, district) are in a sheet. */
const openFilters = async () =>
  fireEvent.press(await screen.findByRole('button', { name: /^(Filtreler|Filters)( \(\d+\))?$/ }));

/** Payload of the most recent search request. */
const lastPayload = () => mockApi.searchEvents.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe('DiscoverScreen', () => {
  it('lists events for a guest: sport, title, when, where and open spots', async () => {
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
    expect(screen.getByText('Futbol · 5v5')).toBeTruthy();
    expect(screen.getByText(/19:30/)).toBeTruthy();
    expect(screen.getByText('Çankaya · ODTÜ Halı Saha 2')).toBeTruthy();
    expect(screen.getByText('8 yer kaldı')).toBeTruthy();
    expect(screen.getByText('1 etkinlik')).toBeTruthy();
  });

  it('shows a loading state before the first page', async () => {
    mockApi.searchEvents.mockReturnValue(new Promise(() => undefined));
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByRole('progressbar', { name: 'Yükleniyor…' })).toBeTruthy();
  });

  it('never shows a hidden place, only the district and a hint', async () => {
    mockApi.searchEvents.mockResolvedValue(page([item({ placeLabel: null })]));
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText(/tam yer onaylananlara gösterilir/)).toBeTruthy();
    expect(screen.queryByText(/ODTÜ/)).toBeNull();
  });

  it('marks a full event and a closed registration', async () => {
    mockApi.searchEvents.mockResolvedValue(
      page([
        item({ id: 'a', title: 'Dolu maç', openSlots: 0, approvedCount: 12 }),
        item({ id: 'b', title: 'Kapanan maç', registrationOpen: false }),
        item({ id: 'c', title: 'Dolu, listesiz', openSlots: 0, waitlistEnabled: false }),
      ]),
    );
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText('Dolu · yedek liste açık')).toBeTruthy();
    expect(screen.getByText('Kayıt kapandı')).toBeTruthy();
    expect(screen.getByText('Dolu')).toBeTruthy();
  });

  it('says on the card whether the game is indoors or outdoors, only when the organizer said so', async () => {
    mockApi.searchEvents.mockResolvedValue(
      page([
        item({ id: 'a', title: 'Açıkta', setting: 'OUTDOOR' }),
        item({ id: 'b', title: 'Belirsiz', setting: null }),
      ]),
    );
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Açıkta');
    expect(screen.getByText('Futbol · 5v5 · Açık hava')).toBeTruthy();
    expect(screen.getAllByText('Futbol · 5v5')).toHaveLength(1);
  });

  it('filters by indoor or outdoor', async () => {
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    await openFilters();
    await fireEvent.press(screen.getByRole('radio', { name: 'Kapalı salon' }));
    await waitFor(() => expect(lastPayload()).toMatchObject({ setting: 'INDOOR' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Fark etmez', checked: false }));
    await waitFor(() => expect(lastPayload()).toEqual({ limit: 20 }));
  });

  it('opens the event when its card is pressed', async () => {
    await renderApp(<DiscoverScreen />);
    await fireEvent.press(await screen.findByRole('link', { name: /Perşembe maçı/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/e/[id]',
      params: { id: '00000000-0000-4000-8000-0000000000e1' },
    });
  });

  it('sends the chosen filters to the server', async () => {
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    expect(lastPayload()).toEqual({ limit: 20 });

    await fireEvent.press(screen.getByRole('radio', { name: 'Tenis' }));
    await waitFor(() => expect(lastPayload()).toMatchObject({ sport_ids: [TENNIS] }));

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yalnızca yeri olan etkinlikler' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bugün' }));
    await openFilters();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Akşam' }));
    await waitFor(() =>
      expect(lastPayload()).toMatchObject({
        sport_ids: [TENNIS],
        time_of_day: ['EVENING'],
        only_open: true,
        to: expect.any(String),
      }),
    );
  });

  it('filters by district through the select', async () => {
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    await openFilters();
    await fireEvent.press(screen.getByRole('button', { name: /^İlçe:/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Çankaya' }));
    await waitFor(() => expect(lastPayload()).toMatchObject({ district_ids: [CANKAYA] }));
  });

  it('keeps the frequent filters on one line and the rest in a sheet until asked for', async () => {
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    expect(screen.getByRole('radio', { name: 'Tenis' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Akşam' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Filtreler' }));
    expect(screen.getByRole('checkbox', { name: 'Akşam' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Sonuçları göster' }));
    expect(screen.queryByRole('checkbox', { name: 'Akşam' })).toBeNull();
  });

  it('a day chip chosen again goes back to any day', async () => {
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bugün' }));
    await waitFor(() => expect(lastPayload()).toMatchObject({ to: expect.any(String) }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bugün' }));
    await waitFor(() => expect(lastPayload()).toEqual({ limit: 20 }));
  });

  it('says so when nothing exists yet and offers to create the first event', async () => {
    mockApi.searchEvents.mockResolvedValue(page([]));
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText('Henüz etkinlik yok')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Etkinlik oluştur' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/create');
  });

  it('tells "nothing in this sport" and "no match" from "nothing yet"', async () => {
    mockApi.searchEvents.mockResolvedValue(page([]));
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Henüz etkinlik yok');

    await fireEvent.press(screen.getByRole('radio', { name: 'Tenis' }));
    expect(await screen.findByText('Tenis için henüz etkinlik yok')).toBeTruthy();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bugün' }));
    expect(screen.getByRole('button', { name: 'Filtreler (1)' })).toBeTruthy();
    expect(await screen.findByText('Bu filtrelere uyan etkinlik yok')).toBeTruthy();

    mockApi.searchEvents.mockResolvedValue(page([item()]));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Filtreleri temizle' })[0]!);
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
    expect(lastPayload()).toEqual({ limit: 20, sport_ids: [TENNIS] });
    expect(screen.getByRole('radio', { name: 'Tenis', checked: true })).toBeTruthy();
  });

  it('offers every sport when the chosen one has no events', async () => {
    mockPreference.stored = TENNIS;
    mockApi.searchEvents.mockResolvedValue(page([]));
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Tenis için henüz etkinlik yok');
    await fireEvent.press(screen.getByRole('button', { name: 'Tüm sporlar' }));
    await waitFor(() => expect(lastPayload()).toEqual({ limit: 20 }));
    expect(mockPreference.store).toHaveBeenLastCalledWith('ALL');
  });

  it('shows a retryable error without leaking the raw message', async () => {
    mockApi.searchEvents.mockRejectedValueOnce(new AppError('RATE_LIMITED'));
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText('Etkinlikler yüklenemedi')).toBeTruthy();
    mockApi.searchEvents.mockResolvedValue(page([item()]));
    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
  });

  it('reports a lost connection as such', async () => {
    mockApi.searchEvents.mockRejectedValueOnce(new Error('Network request failed'));
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText('Etkinlikler yüklenemedi')).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('pages with the cursor and appends the next events', async () => {
    const cursor = { starts_at: '2026-11-05T16:30:00+00:00', id: 'cursor-id' };
    mockApi.searchEvents.mockResolvedValueOnce(page([item({ id: 'a', title: 'Birinci' })], cursor));
    mockApi.searchEvents.mockResolvedValueOnce(page([item({ id: 'b', title: 'İkinci' })]));
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Birinci');
    await fireEvent.press(screen.getByRole('button', { name: 'Daha fazla göster' }));
    expect(await screen.findByText('İkinci')).toBeTruthy();
    expect(screen.getByText('Birinci')).toBeTruthy();
    expect(mockApi.searchEvents).toHaveBeenLastCalledWith(expect.anything(), cursor);
    expect(screen.queryByRole('button', { name: 'Daha fazla göster' })).toBeNull();
  });

  it('is available in English', async () => {
    await renderApp(<DiscoverScreen />, { locale: 'en' });
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Tomorrow' })).toBeTruthy();
  });
});

describe('DiscoverScreen: choosing a sport', () => {
  it('asks on the first visit, with every sport, and searches nothing until answered', async () => {
    mockPreference.stored = null;
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByRole('heading', { name: /Hangi sahada/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Futbol' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tenis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tüm sporlar' })).toBeTruthy();
    expect(mockApi.searchEvents).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Filtreler' })).toBeNull();
  });

  it('shows only the chosen sport and remembers it', async () => {
    mockPreference.stored = null;
    await renderApp(<DiscoverScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Tenis' }));
    await screen.findByText('Perşembe maçı');
    expect(lastPayload()).toEqual({ limit: 20, sport_ids: [TENNIS] });
    expect(mockPreference.store).toHaveBeenCalledWith(TENNIS);
    expect(screen.getByRole('radio', { name: 'Tenis', checked: true })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Hangi sahada/ })).toBeNull();
  });

  it('can start from every sport', async () => {
    mockPreference.stored = null;
    await renderApp(<DiscoverScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Tüm sporlar' }));
    await screen.findByText('Perşembe maçı');
    expect(lastPayload()).toEqual({ limit: 20 });
    expect(mockPreference.store).toHaveBeenCalledWith('ALL');
  });

  it('opens straight on a remembered sport and moves to another from the strip', async () => {
    mockPreference.stored = SPORT;
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    expect(mockApi.searchEvents).toHaveBeenCalledTimes(1);
    expect(lastPayload()).toEqual({ limit: 20, sport_ids: [SPORT] });

    await fireEvent.press(screen.getByRole('radio', { name: 'Tenis' }));
    await waitFor(() => expect(lastPayload()).toEqual({ limit: 20, sport_ids: [TENNIS] }));
    expect(screen.getByRole('radio', { name: 'Futbol', checked: false })).toBeTruthy();
    expect(mockPreference.store).toHaveBeenLastCalledWith(TENNIS);

    await fireEvent.press(screen.getByRole('radio', { name: 'Tüm sporlar' }));
    await waitFor(() => expect(lastPayload()).toEqual({ limit: 20 }));
  });

  it('keeps the other filters when the sport changes', async () => {
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yalnızca yeri olan etkinlikler' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Tenis' }));
    await waitFor(() =>
      expect(lastPayload()).toMatchObject({ only_open: true, sport_ids: [TENNIS] }),
    );
  });

  it('asks again when the remembered sport no longer exists, without searching for it', async () => {
    mockPreference.stored = '00000000-0000-4000-8000-0000000000ff';
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByRole('heading', { name: /Hangi sahada/ })).toBeTruthy();
    expect(mockApi.searchEvents).not.toHaveBeenCalled();
  });
});

describe('DiscoverScreen: days, urgency and the order of sports', () => {
  // 13:00 on Tuesday 27 October 2026 in Istanbul.
  const NOW = Date.parse('2026-10-27T10:00:00Z');
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('groups the list by local day, naming today and tomorrow, and shows only the time on a card', async () => {
    mockApi.searchEvents.mockResolvedValue(
      page([
        item({ id: 'a', title: 'Bugünkü maç', startsAt: '2026-10-27T15:00:00+00:00' }),
        item({ id: 'b', title: 'Yarınki maç', startsAt: '2026-10-28T16:30:00+00:00' }),
        item({ id: 'c', title: 'Cumartesi maçı', startsAt: '2026-10-31T16:00:00+00:00' }),
      ]),
    );
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByRole('heading', { name: 'Bugün' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Yarın' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '31 Ekim Cumartesi' })).toBeTruthy();
    expect(screen.getByText('18:00')).toBeTruthy();
    expect(screen.queryByText(/Salı/)).toBeNull();
  });

  it('puts the late-evening-in-UTC game on the next day of the city', async () => {
    mockApi.searchEvents.mockResolvedValue(
      page([item({ id: 'a', title: 'Gece maçı', startsAt: '2026-10-27T21:30:00+00:00' })]),
    );
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByRole('heading', { name: 'Yarın' })).toBeTruthy();
    expect(screen.getByText('00:30')).toBeTruthy();
  });

  it('marks the last spot and a game that starts within two hours, never a full one', async () => {
    mockApi.searchEvents.mockResolvedValue(
      page([
        item({ id: 'a', title: 'Son yerli', startsAt: '2026-10-28T16:30:00+00:00', openSlots: 1 }),
        item({ id: 'b', title: 'Yakın', startsAt: '2026-10-27T11:30:00+00:00' }),
        item({ id: 'c', title: 'Dolu yakın', startsAt: '2026-10-27T11:30:00+00:00', openSlots: 0 }),
      ]),
    );
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Son yerli');
    expect(screen.getAllByText('Son yer!')).toHaveLength(1);
    expect(screen.getAllByText('2 saat içinde başlıyor')).toHaveLength(1);
  });

  describe('for a signed-in player', () => {
    const player: SessionState = {
      status: 'authenticated',
      userId: '00000000-0000-4000-8000-0000000000aa',
      email: 'p@example.com',
      emailVerified: true,
    };
    const profile = {
      userId: player.status === 'authenticated' ? player.userId : '',
      displayName: 'Oyuncu',
      bio: null,
      cityId: null,
      districtId: null,
      settings: {},
      sports: [{ sportId: SPORT, level: 3, positionIds: [] }],
    };

    const names = (role: 'button' | 'radio') =>
      screen.getAllByRole(role).map((node) => node.props.accessibilityLabel as string);

    it('puts the sports of the profile first when asking, and chooses none of them', async () => {
      mockPreference.stored = null;
      mockApi.fetchMyProfile.mockResolvedValue({
        ...profile,
        sports: [{ sportId: TENNIS, level: 3, positionIds: [] }],
      });
      await renderApp(<DiscoverScreen />, { session: player });
      await screen.findByRole('heading', { name: /Hangi sahada/ });
      expect(names('button').filter((n) => n === 'Tenis' || n === 'Futbol')).toEqual([
        'Tenis',
        'Futbol',
      ]);
      expect(mockApi.searchEvents).not.toHaveBeenCalled();
    });

    it('puts them first on the strip too, without filtering by them', async () => {
      mockApi.fetchMyProfile.mockResolvedValue({
        ...profile,
        sports: [{ sportId: TENNIS, level: 3, positionIds: [] }],
      });
      await renderApp(<DiscoverScreen />, { session: player });
      await screen.findByText('Perşembe maçı');
      expect(names('radio')).toEqual(['Tüm sporlar', 'Tenis', 'Futbol']);
      expect(lastPayload()).toEqual({ limit: 20 });
    });

    it('still asks when the profile cannot be read', async () => {
      mockPreference.stored = null;
      mockApi.fetchMyProfile.mockRejectedValue(new AppError('UNKNOWN'));
      await renderApp(<DiscoverScreen />, { session: player });
      expect(await screen.findByRole('heading', { name: /Hangi sahada/ })).toBeTruthy();
    });
  });
});
