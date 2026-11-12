import { utcToZonedParts, AppError, zonedTimeToUtc } from '@matchup/domain';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { EventDetails } from './api/events-api';
import { emptyDraft } from './draft';
import { CancelEventScreen } from './screens/CancelEventScreen';
import { CreateEventScreen } from './screens/CreateEventScreen';
import { EditEventScreen } from './screens/EditEventScreen';
import { EventDetailScreen } from './screens/EventDetailScreen';
import { EventManageScreen } from './screens/EventManageScreen';

const SPORT = '00000000-0000-4000-8000-0000000000f1';
const F5 = '00000000-0000-4000-8000-0000000000f5';
const F7 = '00000000-0000-4000-8000-0000000000f7';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
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
        {
          id: F7,
          slug: '7v7',
          names: { tr: '7v7', en: '7v7' },
          minParticipants: 14,
          defaultCapacity: 14,
          maxParticipants: 20,
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
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  publishEvent: jest.fn(),
  cancelEvent: jest.fn(),
  completeEvent: jest.fn(),
  deleteDraft: jest.fn(),
  fetchCatalog: jest.fn(),
  fetchMyAccount: jest.fn(),
  fetchMyProfile: jest.fn(),
};
const mockVenues = { search: jest.fn() };
// The organization control is tested with the organizations; here it stays out of the way.
jest.mock('@/features/organizations', () => ({ EventOrganizationControl: () => null }));
jest.mock('./api/venues-api', () => ({
  searchVenues: (...a: unknown[]) => mockVenues.search(...a),
}));
jest.mock('@/features/profile/api/profile-api', () => ({
  fetchMyProfile: (...a: unknown[]) => mockApi.fetchMyProfile(...a),
}));
jest.mock('./city-preference', () => ({
  ...jest.requireActual<typeof import('./city-preference')>('./city-preference'),
  readStoredCity: () => null,
  storeCity: jest.fn(),
}));
jest.mock('./api/events-api', () => ({
  fetchVenueBusiness: () => Promise.resolve(null),
  fetchEventOrganization: () => Promise.resolve(null),
  fetchEvent: (...a: unknown[]) => mockApi.fetchEvent(...a),
  createEvent: (...a: unknown[]) => mockApi.createEvent(...a),
  updateEvent: (...a: unknown[]) => mockApi.updateEvent(...a),
  publishEvent: (...a: unknown[]) => mockApi.publishEvent(...a),
  cancelEvent: (...a: unknown[]) => mockApi.cancelEvent(...a),
  completeEvent: (...a: unknown[]) => mockApi.completeEvent(...a),
  deleteDraft: (...a: unknown[]) => mockApi.deleteDraft(...a),
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

const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    Link: jest.requireActual<typeof import('@/test/link-mock')>('@/test/link-mock').LinkMock,
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/create',
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

function event(over: Partial<EventDetails> = {}): EventDetails {
  return {
    id: EVENT,
    isOrganizer: true,
    organizerName: 'Ayşe A',
    organizerAvatarKey: null,
    organizerAvatarPath: null,
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
    costAmountMinor: 15000,
    costNote: null,
    setting: null,
    equipmentNote: null,
    cancelReason: null,
    cancelMessage: null,
    private: {
      placeLabel: 'ODTÜ Halı Saha 2',
      addressText: 'Üniversiteler Mh.',
      participantNotes: null,
    },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockRouter.canGoBack.mockReturnValue(false);
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockVenues.search.mockResolvedValue([]);
  mockApi.fetchMyProfile.mockResolvedValue({
    userId: ME,
    displayName: 'Ayşe A',
    bio: null,
    cityId: null,
    districtId: null,
    settings: {},
    sports: [],
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
});

const press = (name: string | RegExp, role: 'button' | 'checkbox' = 'button') =>
  fireEvent.press(screen.getByRole(role, { name }));
async function choose(selectLabel: RegExp, option: string) {
  await press(selectLabel);
  await fireEvent.press(screen.getByRole('radio', { name: option }));
}

describe('CreateEventScreen', () => {
  /** Walks the steps to the one holding the details; `toReview` goes on to the last step. */
  async function fillAll(toReview = true) {
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await press('İleri');
    await screen.findByText('Ne zaman, kaç kişi?');
    await press('İleri');
    await screen.findByText('Nerede?');
    await choose(/^İlçe:/, 'Çankaya');
    await fireEvent.changeText(screen.getByLabelText('Yer'), 'ODTÜ Halı Saha 2');
    await press('İleri');
    await screen.findByText('Etkinlik detayları');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), '  Perşembe   maçı ');
    if (toReview) {
      await press('İleri');
      await screen.findByText('Gözden geçir ve yayınla');
    }
  }

  it('starts in the organizer’s province, whose districts can be searched', async () => {
    const IZMIR = '00000000-0000-4000-8000-0000000000c2';
    const KARSIYAKA = '00000000-0000-4000-8000-0000000000d2';
    const BORNOVA = '00000000-0000-4000-8000-0000000000d3';
    mockApi.fetchCatalog.mockResolvedValue({
      ...catalog,
      cities: [
        ...catalog.cities,
        {
          id: IZMIR,
          slug: 'izmir',
          names: { tr: 'İzmir', en: 'İzmir' },
          timeZone: 'Europe/Istanbul',
          districts: [
            { id: BORNOVA, slug: 'bornova', names: { tr: 'Bornova', en: 'Bornova' } },
            { id: KARSIYAKA, slug: 'karsiyaka', names: { tr: 'Karşıyaka', en: 'Karşıyaka' } },
          ],
        },
      ],
    });
    mockApi.fetchMyProfile.mockResolvedValue({
      userId: ME,
      displayName: 'Ayşe A',
      bio: null,
      cityId: IZMIR,
      districtId: null,
      settings: {},
      sports: [],
    });
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await press('İleri');
    await press('İleri');
    await screen.findByText('Nerede?');
    expect(screen.getByRole('button', { name: 'İl: İzmir' })).toBeTruthy();
    await press(/^İlçe:/);
    await fireEvent.changeText(screen.getByLabelText('Ara'), 'karsi');
    expect(screen.queryByRole('radio', { name: 'Bornova' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Karşıyaka' }));
    expect(screen.getByRole('button', { name: 'İlçe: Karşıyaka' })).toBeTruthy();
  });

  it('offers the district’s venues, fills the place from one, and sends it', async () => {
    const VENUE = '00000000-0000-4000-8000-0000000000b1';
    mockVenues.search.mockResolvedValue([
      {
        id: VENUE,
        name: 'Yıldız Halı Saha',
        kind: 'COMMERCIAL_FACILITY',
        verified: false,
        cityId: ANKARA,
        districtId: CANKAYA,
        addressText: 'Üniversiteler Mh.',
        point: { lat: 39.895, lon: 32.7795 },
        sportIds: [SPORT],
      },
    ]);
    mockApi.createEvent.mockResolvedValue(EVENT);
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await press('İleri');
    await press('İleri');
    await screen.findByText('Nerede?');
    expect(screen.queryByRole('button', { name: /^Mekân/ })).toBeNull();
    await choose(/^İlçe:/, 'Çankaya');
    await waitFor(() =>
      expect(mockVenues.search).toHaveBeenCalledWith({ cityId: ANKARA, districtId: CANKAYA }),
    );
    await choose(/^Mekân \(isteğe bağlı\):/, 'Yıldız Halı Saha · doğrulanmamış');
    expect(screen.getByLabelText('Yer').props.value).toBe('Yıldız Halı Saha');
    await press('İleri');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), 'Cuma maçı');
    await press('İleri');
    await press('Yayınla');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
    const call = mockApi.createEvent.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(call.input).toMatchObject({
      venue_id: VENUE,
      location_label: 'Yıldız Halı Saha',
      address_text: 'Üniversiteler Mh.',
    });
  });

  it('does not leave step 1 without a sport and a format', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await press('İleri');
    expect(await screen.findByText('Bir spor seç.')).toBeTruthy();
    expect(screen.getByText('Bir format seç.')).toBeTruthy();
    expect(screen.getByText('Devam etmek için işaretli alanları düzelt.')).toBeTruthy();
    expect(screen.queryByText('Ne zaman, kaç kişi?')).toBeNull();
  });

  it('choosing a sport picks its first format and that format’s default capacity', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    expect(screen.getByRole('button', { name: 'Format: 5v5 (10–14 kişi)' })).toBeTruthy();
  });

  it('publishes exactly what was chosen, with the start converted from Ankara time to UTC', async () => {
    mockApi.createEvent.mockResolvedValue(EVENT);
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await press('İleri');
    await press('Kontenjanı artır');
    await press('İleri');
    await choose(/^İlçe:/, 'Çankaya');
    await fireEvent.changeText(screen.getByLabelText('Yer'), 'ODTÜ Halı Saha 2');
    await press('İleri');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), '  Perşembe   maçı ');
    await press('İleri');
    await press('Yayınla');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
    const call = mockApi.createEvent.mock.calls[0]?.[0] as {
      clientRequestId: string;
      input: Record<string, unknown>;
      publish: boolean;
    };
    const expectedDate = emptyDraft(catalog, new Date(), ANKARA).date;
    expect(call.publish).toBe(true);
    expect(call.clientRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(call.input).toMatchObject({
      sport_id: SPORT,
      sport_format_id: F5,
      title: 'Perşembe maçı',
      city_id: ANKARA,
      district_id: CANKAYA,
      location_label: 'ODTÜ Halı Saha 2',
      capacity: 11,
      starts_at: zonedTimeToUtc(expectedDate, '19:00', 'Europe/Istanbul'),
      duration_minutes: 90,
      organizer_plays: true,
      auto_approve: false,
      setting: null,
    });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/e/[id]',
        params: { id: EVENT },
      }),
    );
  });

  it('lets the organizer say indoor or outdoor and sends that choice', async () => {
    mockApi.createEvent.mockResolvedValue(EVENT);
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await press('İleri');
    await press('İleri');
    await choose(/^İlçe:/, 'Çankaya');
    await fireEvent.changeText(screen.getByLabelText('Yer'), 'ODTÜ Halı Saha 2');
    await fireEvent.press(screen.getByRole('radio', { name: 'Açık hava' }));
    await press('İleri');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), '  Perşembe   maçı ');
    await press('İleri');
    await press('Yayınla');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
    const call = mockApi.createEvent.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(call.input.setting).toBe('OUTDOOR');
  });

  it('lets the organizer switch on automatic approval and sends that choice', async () => {
    mockApi.createEvent.mockResolvedValue(EVENT);
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await fillAll(false);
    expect(
      screen.getByText(/Yer boşken ve bekleyen yokken oyuncular hemen onaylanır/),
    ).toBeTruthy();
    const box = screen.getByRole('checkbox', {
      name: 'Yer varken istekleri otomatik onayla',
      checked: false,
    });
    await fireEvent.press(box);
    await press('İleri');
    await press('Yayınla');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
    const call = mockApi.createEvent.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(call.input.auto_approve).toBe(true);
  });

  it('shows a server refusal and retries with the SAME request id (no duplicate event)', async () => {
    mockApi.createEvent.mockRejectedValueOnce(new AppError('NETWORK')).mockResolvedValueOnce(EVENT);
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await fillAll();
    await press('Yayınla');
    expect(await screen.findByText(/Bağlantı kurulamadı/)).toBeTruthy();
    await press('Yayınla');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(2));
    const ids = mockApi.createEvent.mock.calls.map(
      (c) => (c[0] as { clientRequestId: string }).clientRequestId,
    );
    expect(ids[0]).toBe(ids[1]);
  });

  it('localizes the server’s lead-time refusal', async () => {
    mockApi.createEvent.mockRejectedValue(new AppError('START_TOO_SOON'));
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await fillAll();
    await press('Yayınla');
    expect(await screen.findByText('Etkinlik en az 1 saat sonra başlamalı.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('saves a draft without publishing', async () => {
    mockApi.createEvent.mockResolvedValue(EVENT);
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await fillAll();
    await press('Taslak olarak kaydet');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
    expect((mockApi.createEvent.mock.calls[0]?.[0] as { publish: boolean }).publish).toBe(false);
  });

  it('sets the date and time with the wheels, also through screen-reader adjustments', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await press('İleri');
    const date = await screen.findByRole('adjustable', { name: 'Tarih' });
    const hour = screen.getByRole('adjustable', { name: 'Saat' });
    // The new event starts tomorrow at 19:00.
    expect(date).toHaveAccessibilityValue({ text: 'Yarın' });
    expect(hour).toHaveAccessibilityValue({ text: '19' });
    const adjust = (wheel: typeof date, actionName: 'increment' | 'decrement') =>
      fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName } });
    await adjust(date, 'decrement');
    expect(screen.getByRole('adjustable', { name: 'Tarih' })).toHaveAccessibilityValue({
      text: 'Bugün',
    });
    expect(screen.getByRole('checkbox', { name: 'Bugün', checked: true })).toBeTruthy();
    await adjust(hour, 'increment');
    await fireEvent.press(
      within(screen.getByRole('adjustable', { name: 'Dakika' })).getByText('45', {
        includeHiddenElements: true,
      }),
    );
    expect(screen.getByRole('adjustable', { name: 'Saat' })).toHaveAccessibilityValue({
      text: '20',
    });
    expect(screen.getByRole('adjustable', { name: 'Dakika' })).toHaveAccessibilityValue({
      text: '45',
    });
  });

  it('reviews what was entered, says who approves, and jumps back to a section', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await fillAll();
    expect(screen.getByText('Çankaya · ODTÜ Halı Saha 2')).toBeTruthy();
    expect(screen.getByText('Perşembe   maçı')).toBeTruthy();
    expect(screen.getByText(/Katılım isteklerini sen onaylarsın/)).toBeTruthy();
    await press('Nerede? bölümünü düzenle');
    expect(await screen.findByLabelText('Yer')).toBeTruthy();
    expect(mockApi.createEvent).not.toHaveBeenCalled();
  });

  it('says a stated cost is not collected', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await fillAll(false);
    await fireEvent.changeText(screen.getByLabelText(/^Kişi başı ücret/), '150');
    await press('İleri');
    expect(await screen.findByText('~150 ₺ · bilgilendirme')).toBeTruthy();
    expect(screen.getByText(/ödeme uygulama üzerinden alınmaz/)).toBeTruthy();
  });

  it('a bad field found when publishing goes back to its step', async () => {
    mockApi.createEvent.mockResolvedValue(EVENT);
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await press('İleri');
    // Half an hour ahead (on the wheel's 5-minute grid): fine for a draft, too soon to publish.
    const step = 5 * 60_000;
    const soon = utcToZonedParts(
      new Date(Math.ceil((Date.now() + 30 * 60_000) / step) * step).toISOString(),
      'Europe/Istanbul',
    );
    const today = utcToZonedParts(new Date().toISOString(), 'Europe/Istanbul').date;
    await screen.findByRole('adjustable', { name: 'Tarih' });
    await press(soon.date === today ? 'Bugün' : 'Yarın', 'checkbox');
    const [hour, minute] = soon.time.split(':') as [string, string];
    await fireEvent.press(
      within(screen.getByRole('adjustable', { name: 'Saat' })).getByText(hour, {
        includeHiddenElements: true,
      }),
    );
    await fireEvent.press(
      within(screen.getByRole('adjustable', { name: 'Dakika' })).getByText(minute, {
        includeHiddenElements: true,
      }),
    );
    expect(screen.getByRole('adjustable', { name: 'Saat' })).toHaveAccessibilityValue({
      text: hour,
    });
    await press('İleri');
    await choose(/^İlçe:/, 'Çankaya');
    await fireEvent.changeText(screen.getByLabelText('Yer'), 'ODTÜ Halı Saha 2');
    await press('İleri');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), 'Perşembe maçı');
    await press('İleri');
    await press('Yayınla');
    expect(await screen.findByRole('adjustable', { name: 'Tarih' })).toBeTruthy();
    expect(screen.getByText('Devam etmek için işaretli alanları düzelt.')).toBeTruthy();
    expect(mockApi.createEvent).not.toHaveBeenCalled();
  });

  it('works in English too', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn, locale: 'en' });
    expect(await screen.findByText('What will you play?')).toBeTruthy();
  });
});

describe('EventDetailScreen', () => {
  it('a draft offers publish, edit and a confirmed delete to its organizer', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(event({ status: 'DRAFT' }));
    mockApi.publishEvent.mockResolvedValue(undefined);
    mockApi.deleteDraft.mockResolvedValue(undefined);
    await renderApp(<EventManageScreen />, { session: signedIn });
    await screen.findByRole('heading', { name: 'Etkinliği yönet' });
    await press('Yayınla');
    await waitFor(() => expect(mockApi.publishEvent.mock.calls[0]?.[0]).toBe(EVENT));
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    await press('Taslağı sil');
    expect(mockApi.deleteDraft).not.toHaveBeenCalled();
    expect(screen.getByText('Taslak kalıcı olarak silinecek. Emin misin?')).toBeTruthy();
    await press('Evet, sil');
    await waitFor(() => expect(mockApi.deleteDraft.mock.calls[0]?.[0]).toBe(EVENT));
    expect(mockRouter.replace).toHaveBeenCalledWith('/create');
  });

  it('a published, upcoming event is managed with edit and cancel, no publish', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(event());
    await renderApp(<EventManageScreen />, { session: signedIn });
    await screen.findByRole('heading', { name: 'Etkinliği yönet' });
    expect(screen.queryByRole('button', { name: 'Yayınla' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    await press('Etkinliği iptal et');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/e/[id]/cancel',
      params: { id: EVENT },
    });
  });

  it('the event page gives its organizer the details and one way to manage', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(event());
    await renderApp(<EventDetailScreen />, { session: signedIn });
    await screen.findByText('Perşembe maçı');
    expect(screen.getByText('Çankaya · ODTÜ Halı Saha 2 · Üniversiteler Mh.')).toBeTruthy();
    expect(screen.getByText('1/12 kişi')).toBeTruthy();
    expect(screen.getByText('~150 ₺ · bilgilendirme')).toBeTruthy();
    expect(screen.getByText('Gerekmiyor (organizatörün beyanı)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Etkinliği iptal et' })).toBeNull();
    await press('Etkinliği yönet');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/e/[id]/manage',
      params: { id: EVENT },
    });
  });

  it('names the venue and whether an administrator verified it', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(
      event({
        venue: {
          id: '00000000-0000-4000-8000-0000000000b1',
          name: 'Yıldız Halı Saha',
          kind: 'COMMERCIAL_FACILITY',
          verified: true,
        },
      }),
    );
    await renderApp(<EventDetailScreen />, { session: signedIn });
    expect(await screen.findByText('Yıldız Halı Saha · doğrulanmış mekân')).toBeTruthy();
  });

  it('the manage page sends anyone but the organizer back, showing no tools', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(event({ isOrganizer: false }));
    await renderApp(<EventManageScreen />, { session: signedIn });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/e/[id]',
        params: { id: EVENT },
      }),
    );
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
  });

  it('a canceled event has nothing to manage', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(event({ status: 'CANCELED', cancelReason: 'WEATHER' }));
    await renderApp(<EventManageScreen />, { session: signedIn });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/e/[id]',
        params: { id: EVENT },
      }),
    );
  });

  it('someone else sees no organizer actions, and a hidden place only as its district', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(
      event({
        isOrganizer: false,
        locationVisibility: 'APPROVED_ONLY',
        publicPlaceLabel: null,
        private: null,
      }),
    );
    await renderApp(<EventDetailScreen />, { session: signedIn });
    await screen.findByText('Perşembe maçı');
    expect(screen.getByText('Çankaya · tam yer onaylananlara gösterilir')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Etkinliği iptal et' })).toBeNull();
  });

  it('guests reach the page; an unknown event is an honest not-found with a way to Discover', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(null);
    await renderApp(<EventDetailScreen />);
    expect(await screen.findByText('Aradığın içerik bulunamadı.')).toBeTruthy();
    await press('Keşfet');
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('a canceled event shows its reason and no actions', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(
      event({ status: 'CANCELED', cancelReason: 'WEATHER', cancelMessage: 'Yağmur' }),
    );
    await renderApp(<EventDetailScreen />, { session: signedIn });
    expect(await screen.findByText('İptal sebebi: Hava durumu — Yağmur')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Etkinliği yönet' })).toBeNull();
  });
});

describe('CancelEventScreen', () => {
  it('requires a reason, then cancels with it', async () => {
    mockParams = { id: EVENT };
    mockApi.cancelEvent.mockResolvedValue(undefined);
    await renderApp(<CancelEventScreen />, { session: signedIn });
    await screen.findByText(/geri alınamaz/);
    await press('Etkinliği iptal et');
    expect(await screen.findByText('Bir sebep seç.')).toBeTruthy();
    expect(mockApi.cancelEvent).not.toHaveBeenCalled();
    await choose(/^Sebep:/, 'Hava durumu');
    await press('Etkinliği iptal et');
    await waitFor(() =>
      expect(mockApi.cancelEvent.mock.calls[0]?.[0]).toEqual({
        id: EVENT,
        reason: 'WEATHER',
        message: null,
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/e/[id]', params: { id: EVENT } });
  });

  it('goes back to the detail underneath instead of stacking a second copy', async () => {
    mockParams = { id: EVENT };
    mockRouter.canGoBack.mockReturnValue(true);
    mockApi.cancelEvent.mockResolvedValue(undefined);
    await renderApp(<CancelEventScreen />, { session: signedIn });
    await screen.findByText(/geri alınamaz/);
    await choose(/^Sebep:/, 'Hava durumu');
    await press('Etkinliği iptal et');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('EditEventScreen', () => {
  it('prefills a published event, locks sport and format, and saves the change', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(event());
    mockApi.updateEvent.mockResolvedValue(undefined);
    await renderApp(<EditEventScreen />, { session: signedIn });
    expect(
      await screen.findByText('Yayınlandıktan sonra spor, format ve oynama durumu değiştirilemez.'),
    ).toBeTruthy();
    await press('İleri');
    expect(screen.queryByRole('checkbox', { name: /Ben de oynayacağım/ })).toBeNull();
    await press('İleri');
    await press('İleri');
    expect(screen.getByLabelText('Başlık').props.value).toBe('Perşembe maçı');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), 'Cuma maçı');
    await press('İleri');
    await act(async () => {
      await press('Değişiklikleri kaydet');
    });
    await waitFor(() => expect(mockApi.updateEvent).toHaveBeenCalledTimes(1));
    const call = mockApi.updateEvent.mock.calls[0]?.[0] as {
      id: string;
      input: Record<string, unknown>;
    };
    expect(call.id).toBe(EVENT);
    expect(call.input).toMatchObject({
      title: 'Cuma maçı',
      capacity: 12,
      cost_amount_minor: 15000,
      address_text: 'Üniversiteler Mh.',
    });
  });
});
