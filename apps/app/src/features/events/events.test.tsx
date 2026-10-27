import { AppError, zonedTimeToUtc } from '@matchup/domain';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { EventDetails } from './api/events-api';
import { emptyDraft } from './draft';
import { CancelEventScreen } from './screens/CancelEventScreen';
import { CreateEventScreen } from './screens/CreateEventScreen';
import { EditEventScreen } from './screens/EditEventScreen';
import { EventDetailScreen } from './screens/EventDetailScreen';

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
};
jest.mock('./api/events-api', () => ({
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
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/create',
    Redirect: ({ href }: { href: unknown }) => (
      <Text testID="redirect">{JSON.stringify(href)}</Text>
    ),
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    organizerId: ME,
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
    organizerPlays: true,
    skillMin: null,
    skillMax: null,
    bookingStatus: 'NOT_REQUIRED',
    costAmountMinor: 15000,
    costNote: null,
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
async function choose(selectLabel: RegExp, option: string) {
  await press(selectLabel);
  await fireEvent.press(screen.getByRole('radio', { name: option }));
}

describe('CreateEventScreen', () => {
  async function fillAll() {
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), '  Perşembe   maçı ');
    await press('İleri');
    await screen.findByText('Ne zaman, nerede?');
    await choose(/^İlçe:/, 'Çankaya');
    await fireEvent.changeText(screen.getByLabelText('Yer'), 'ODTÜ Halı Saha 2');
    await press('İleri');
    await screen.findByText('Kimler, kaç kişi?');
  }

  it('does not leave step 1 without a sport, a format and a title', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await press('İleri');
    expect(await screen.findByText('Bir spor seç.')).toBeTruthy();
    expect(screen.getByText('Bir format seç.')).toBeTruthy();
    expect(screen.getByText('Başlık en az 3 karakter olmalı.')).toBeTruthy();
    expect(screen.queryByText('Ne zaman, nerede?')).toBeNull();
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
    await fillAll();
    await press('Kontenjanı artır');
    await press('Yayınla');
    await waitFor(() => expect(mockApi.createEvent).toHaveBeenCalledTimes(1));
    const call = mockApi.createEvent.mock.calls[0]?.[0] as {
      clientRequestId: string;
      input: Record<string, unknown>;
      publish: boolean;
    };
    const expectedDate = emptyDraft(catalog, new Date()).date;
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
    });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/e/[id]',
        params: { id: EVENT },
      }),
    );
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

  it('rejects a typed date that is not a real date', async () => {
    await renderApp(<CreateEventScreen />, { session: signedIn });
    await screen.findByText('Ne oynanacak?');
    await choose(/^Spor:/, 'Futbol');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), 'Maç');
    await press('İleri');
    await fireEvent.changeText(await screen.findByLabelText('Tarih (GG.AA.YYYY)'), '31.02.2027');
    await press('İleri');
    expect(await screen.findByText('Geçerli bir tarih gir (GG.AA.YYYY).')).toBeTruthy();
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
    await renderApp(<EventDetailScreen />, { session: signedIn });
    await screen.findByText('Perşembe maçı');
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

  it('a published, upcoming event offers edit and cancel (no publish) and shows its details', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(event());
    await renderApp(<EventDetailScreen />, { session: signedIn });
    await screen.findByText('Perşembe maçı');
    expect(screen.queryByRole('button', { name: 'Yayınla' })).toBeNull();
    expect(screen.getByText('Çankaya · ODTÜ Halı Saha 2 · Üniversiteler Mh.')).toBeTruthy();
    expect(screen.getByText('1/12 kişi')).toBeTruthy();
    expect(screen.getByText('~150 ₺ · bilgilendirme')).toBeTruthy();
    await press('Etkinliği iptal et');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/e/[id]/cancel',
      params: { id: EVENT },
    });
  });

  it('someone else sees no organizer actions, and a hidden place only as its district', async () => {
    mockParams = { id: EVENT };
    mockApi.fetchEvent.mockResolvedValue(
      event({
        organizerId: '00000000-0000-4000-8000-0000000000bb',
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
    expect(screen.getByLabelText('Başlık').props.value).toBe('Perşembe maçı');
    await fireEvent.changeText(screen.getByLabelText('Başlık'), 'Cuma maçı');
    await press('İleri');
    await press('İleri');
    expect(screen.queryByRole('checkbox', { name: /Ben de oynayacağım/ })).toBeNull();
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
