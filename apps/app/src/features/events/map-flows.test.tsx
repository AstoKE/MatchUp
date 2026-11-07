import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { EventListItem } from './api/search-api';
import { CreateEventScreen } from './screens/CreateEventScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';

/**
 * Phase 4 / M5 with a map configured: the pin picker, suggesting a venue, Discover's map and "near me". The map itself
 * is a stand-in (MapLibre is native code and WebGL): markers are buttons, and one more button is a tap on the map.
 */
const SPORT = '00000000-0000-4000-8000-0000000000f1';
const F5 = '00000000-0000-4000-8000-0000000000f5';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const VENUE = '00000000-0000-4000-8000-0000000000b1';
const ME = '00000000-0000-4000-8000-0000000000aa';

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
  ],
  cities: [
    {
      id: ANKARA,
      slug: 'ankara',
      names: { tr: 'Ankara', en: 'Ankara' },
      timeZone: 'Europe/Istanbul',
      center: { lat: 39.92, lon: 32.85 },
      districts: [
        {
          id: CANKAYA,
          slug: 'cankaya',
          names: { tr: 'Çankaya', en: 'Çankaya' },
          center: { lat: 39.9083, lon: 32.8461 },
        },
      ],
    },
  ],
};

const mockApi = {
  createEvent: jest.fn(),
  fetchCatalog: jest.fn(),
  fetchMyAccount: jest.fn(),
  fetchMyProfile: jest.fn(),
  searchVenues: jest.fn(),
  suggestVenue: jest.fn(),
  searchEvents: jest.fn(),
  locateMe: jest.fn(),
  mapProps: [] as { center: unknown; zoom: number }[],
};
jest.mock('./api/events-api', () => ({
  ...jest.requireActual<typeof import('./api/events-api')>('./api/events-api'),
  createEvent: (...a: unknown[]) => mockApi.createEvent(...a),
}));
jest.mock('./api/venues-api', () => ({
  searchVenues: (...a: unknown[]) => mockApi.searchVenues(...a),
  suggestVenue: (...a: unknown[]) => mockApi.suggestVenue(...a),
}));
jest.mock('./api/search-api', () => ({
  ...jest.requireActual<typeof import('./api/search-api')>('./api/search-api'),
  searchEvents: (...a: unknown[]) => mockApi.searchEvents(...a),
}));
jest.mock('./near-me', () => ({ locateMe: () => mockApi.locateMe() }));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));
jest.mock('@/features/profile/api/profile-api', () => ({
  fetchMyProfile: (...a: unknown[]) => mockApi.fetchMyProfile(...a),
}));
jest.mock('@/features/onboarding/api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockApi.fetchMyAccount(...a),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  acceptCurrentLegalTerms: jest.fn(),
}));
jest.mock('./city-preference', () => ({
  ...jest.requireActual<typeof import('./city-preference')>('./city-preference'),
  readStoredCity: () => null,
  storeCity: jest.fn(),
}));
jest.mock('./discover-sport-preference', () => ({
  ALL_SPORTS: 'ALL',
  readDiscoverSport: () => Promise.resolve('ALL'),
  storeDiscoverSport: jest.fn(),
}));
jest.mock('@/lib/map-config', () => ({ mapStyleUrl: 'https://tiles.example/style.json' }));
jest.mock('@/features/map', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MapCanvas: (props: {
      center: unknown;
      zoom: number;
      markers: { id: string; kind: string; label: string }[];
      onPressMarker?: (id: string) => void;
      onPressMap?: (p: { lat: number; lon: number }) => void;
      accessibilityLabel: string;
    }) => {
      mockApi.mapProps.push({ center: props.center, zoom: props.zoom });
      return React.createElement(
        View,
        { accessibilityLabel: props.accessibilityLabel },
        ...props.markers.map((m) =>
          React.createElement(Pressable, {
            key: m.id,
            accessibilityRole: 'button',
            accessibilityLabel: `${m.kind}: ${m.label}`,
            onPress: () => props.onPressMarker?.(m.id),
          }),
        ),
        React.createElement(Pressable, {
          key: 'tap',
          accessibilityRole: 'button',
          accessibilityLabel: 'tap the map',
          onPress: () => props.onPressMap?.({ lat: 39.895, lon: 32.7795 }),
        }),
      );
    },
  };
});
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Link: jest.requireActual<typeof import('@/test/link-mock')>('@/test/link-mock').LinkMock,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
}));

const signedIn: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'a@example.com',
  emailVerified: true,
};

function item(over: Partial<EventListItem> = {}): EventListItem {
  return {
    id: EVENT,
    title: 'Perşembe maçı',
    sportId: SPORT,
    formatId: F5,
    startsAt: '2026-11-20T16:30:00+00:00',
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
    point: { lat: 39.895, lon: 32.7795 },
    pointPrecision: 'EXACT',
    venue: null,
    distanceM: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.mapProps = [];
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.fetchMyAccount.mockResolvedValue({
    userId: ME,
    status: 'ACTIVE',
    emailVerified: true,
    adultConfirmed: true,
    onboarded: true,
    legalConsentCurrent: true,
    deletionDueAt: null,
  });
  mockApi.fetchMyProfile.mockResolvedValue({
    userId: ME,
    displayName: 'Ayşe A',
    bio: null,
    cityId: ANKARA,
    districtId: null,
    settings: {},
    sports: [],
  });
  mockApi.searchVenues.mockResolvedValue([]);
  mockApi.createEvent.mockResolvedValue(EVENT);
  mockApi.searchEvents.mockResolvedValue({ items: [item()], nextCursor: null });
});

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
async function toWhere() {
  await renderApp(<CreateEventScreen />, { session: signedIn });
  await screen.findByText('Ne oynanacak?');
  await press(/^Spor:/);
  await fireEvent.press(screen.getByRole('radio', { name: 'Futbol' }));
  await press('İleri');
  await press('İleri');
  await screen.findByText('Nerede?');
  await press(/^İlçe:/);
  await fireEvent.press(screen.getByRole('radio', { name: 'Çankaya' }));
}
async function publish() {
  await fireEvent.changeText(screen.getByLabelText('Yer'), 'ODTÜ Halı Saha 2');
  await press('İleri');
  await fireEvent.changeText(screen.getByLabelText('Başlık'), 'Cuma maçı');
  await press('İleri');
  await press('Yayınla');
  await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
  return (mockApi.createEvent.mock.calls[0]?.[0] as { input: Record<string, unknown> }).input;
}

describe('the pin', () => {
  it('opens on the district, takes a tap, and is sent with the event', async () => {
    await toWhere();
    expect(screen.getByText('İşaretlenmedi')).toBeTruthy();
    await press('Haritada işaretle');
    expect(mockApi.mapProps.at(-1)).toEqual({ center: { lat: 39.9083, lon: 32.8461 }, zoom: 13 });
    const save = screen.getByRole('button', { name: 'Bu yeri kullan' });
    expect(save.props.accessibilityState.disabled).toBe(true);
    await press('tap the map');
    await press('Bu yeri kullan');
    expect(screen.getByText('İşaretlendi: 39.89500, 32.77950')).toBeTruthy();
    expect(await publish()).toMatchObject({ point: { lat: 39.895, lon: 32.7795 } });
  });

  it('can be removed again: the event then has none', async () => {
    await toWhere();
    await press('Haritada işaretle');
    await press('tap the map');
    await press('Bu yeri kullan');
    await press('Kaldır');
    expect(screen.getByText('İşaretlenmedi')).toBeTruthy();
    expect(await publish()).toMatchObject({ point: null });
  });

  it('a chosen venue brings its point', async () => {
    mockApi.searchVenues.mockResolvedValue([
      {
        id: VENUE,
        name: 'Yıldız Halı Saha',
        kind: 'COMMERCIAL_FACILITY',
        verified: true,
        cityId: ANKARA,
        districtId: CANKAYA,
        addressText: null,
        point: { lat: 39.9, lon: 32.78 },
        sportIds: [SPORT],
      },
    ]);
    await toWhere();
    await press(/^Mekân \(isteğe bağlı\):/);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Yıldız Halı Saha' }));
    expect(screen.getByText('İşaretlendi: 39.90000, 32.78000')).toBeTruthy();
  });
});

describe('suggesting a venue', () => {
  it('needs a name, a sport and a point, then is chosen for the event', async () => {
    mockApi.suggestVenue.mockResolvedValue(VENUE);
    await toWhere();
    await press('Listede yok mu? Mekân öner');
    await fireEvent.changeText(screen.getByLabelText('Mekânın adı'), 'Yeni Saha');
    await press('Öner');
    expect(
      screen.getByText('Ad (en az 3 harf), en az bir spor ve haritada bir yer gerekli.'),
    ).toBeTruthy();
    expect(mockApi.suggestVenue).not.toHaveBeenCalled();
    await press('tap the map');
    await press('Öner');
    await waitFor(() =>
      expect(mockApi.suggestVenue).toHaveBeenCalledWith(
        {
          kind: 'COMMERCIAL_FACILITY',
          name: 'Yeni Saha',
          cityId: ANKARA,
          districtId: CANKAYA,
          point: { lat: 39.895, lon: 32.7795 },
          sportIds: [SPORT],
        },
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Mekân önerildi ve seçildi.')).toBeTruthy();
    expect(screen.getByLabelText('Yer').props.value).toBe('Yeni Saha');
    await press('İleri');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), 'Cuma maçı');
    await press('İleri');
    await press('Yayınla');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
    expect(mockApi.createEvent.mock.calls[0]?.[0]).toMatchObject({
      input: { venue_id: VENUE, point: { lat: 39.895, lon: 32.7795 } },
    });
  });
});

describe('Discover with a map', () => {
  it('shows the results on the map: a pin for an exact place, an area for a hidden one', async () => {
    mockApi.searchEvents.mockResolvedValue({
      items: [
        item(),
        item({
          id: '00000000-0000-4000-8000-0000000000e2',
          title: 'Gizli maç',
          placeLabel: null,
          pointPrecision: 'APPROXIMATE',
        }),
      ],
      nextCursor: null,
    });
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    await fireEvent.press(screen.getByRole('radio', { name: 'Harita' }));
    expect(await screen.findByRole('button', { name: 'pin: Perşembe maçı' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'area: Gizli maç' })).toBeTruthy();
    expect(mockApi.mapProps.at(-1)).toEqual({ center: { lat: 39.92, lon: 32.85 }, zoom: 10 });
    await press('area: Gizli maç');
    expect(await screen.findByRole('link', { name: /Gizli maç/ })).toBeTruthy();
  });

  it('near me asks once, sorts by distance and shows how far', async () => {
    mockApi.locateMe.mockResolvedValue({ point: { lat: 39.9, lon: 32.8 } });
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    mockApi.searchEvents.mockResolvedValue({
      items: [item({ distanceM: 1200 })],
      nextCursor: null,
    });
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yakınımdakiler' }));
    await waitFor(() =>
      expect(mockApi.searchEvents.mock.calls.at(-1)?.[0]).toMatchObject({
        near: { lat: 39.9, lon: 32.8 },
        sort: 'NEAREST',
      }),
    );
    expect(await screen.findByText(/1,2 km/)).toBeTruthy();
    expect(screen.getByText('1 etkinlik, en yakın önce')).toBeTruthy();
    expect(mockApi.locateMe).toHaveBeenCalledTimes(1);
  });

  it('says so when the permission is refused, and keeps the province', async () => {
    mockApi.locateMe.mockResolvedValue({ error: 'DENIED' });
    await renderApp(<DiscoverScreen />);
    await screen.findByText('Perşembe maçı');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Yakınımdakiler' }));
    expect(await screen.findByText(/Konum izni verilmedi/)).toBeTruthy();
    expect(mockApi.searchEvents.mock.calls.at(-1)?.[0]).not.toHaveProperty('near');
  });
});
