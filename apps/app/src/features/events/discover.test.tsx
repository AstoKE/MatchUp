import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
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

const mockApi = { searchEvents: jest.fn(), fetchCatalog: jest.fn() };
jest.mock('./api/search-api', () => ({
  ...jest.requireActual<typeof import('./api/search-api')>('./api/search-api'),
  searchEvents: (...a: unknown[]) => mockApi.searchEvents(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
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
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.searchEvents.mockResolvedValue(page([item()]));
});

/** Payload of the most recent search request. */
const lastPayload = () => mockApi.searchEvents.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe('DiscoverScreen', () => {
  it('lists events for a guest: sport, title, when, where, slots and organizer', async () => {
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
    expect(screen.getByText('Futbol · 5v5')).toBeTruthy();
    expect(screen.getByText(/19:30/)).toBeTruthy();
    expect(screen.getByText('Çankaya · ODTÜ Halı Saha 2')).toBeTruthy();
    expect(screen.getByText('4/12 kişi')).toBeTruthy();
    expect(screen.getByText(/Ayşe A düzenliyor/)).toBeTruthy();
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
    expect(await screen.findByText(/12\/12 kişi · Dolu · bekleme listesi açık/)).toBeTruthy();
    expect(screen.getByText(/Kayıt kapandı/)).toBeTruthy();
    expect(screen.getByText(/· Dolu$/)).toBeTruthy();
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

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tenis' }));
    await waitFor(() => expect(lastPayload()).toMatchObject({ sport_ids: [TENNIS] }));

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Akşam' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yalnızca yeri olan etkinlikler' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Bugün' }));
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
    await fireEvent.press(screen.getByRole('button', { name: /^İlçe:/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Çankaya' }));
    await waitFor(() => expect(lastPayload()).toMatchObject({ district_ids: [CANKAYA] }));
  });

  it('says so when nothing exists yet and offers to create the first event', async () => {
    mockApi.searchEvents.mockResolvedValue(page([]));
    await renderApp(<DiscoverScreen />);
    expect(await screen.findByText('Henüz etkinlik yok')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Etkinlik oluştur' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/create');
  });

  it('distinguishes "no match" from "nothing yet" and clearing the filters searches again', async () => {
    mockApi.searchEvents.mockResolvedValue(page([]));
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Henüz etkinlik yok');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tenis' }));
    expect(await screen.findByText('Bu filtrelere uyan etkinlik yok')).toBeTruthy();

    mockApi.searchEvents.mockResolvedValue(page([item()]));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Filtreleri temizle' })[0]!);
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
    expect(lastPayload()).toEqual({ limit: 20 });
    expect(screen.getByRole('checkbox', { name: 'Tenis', checked: false })).toBeTruthy();
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
    expect(screen.getByText('4/12 players')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Tomorrow' })).toBeTruthy();
  });
});
