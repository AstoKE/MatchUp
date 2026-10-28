import { AppError } from '@matchup/domain';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { MyEventItem, MyEventsPage } from './api/my-events-api';
import { MyEventsScreen } from './screens/MyEventsScreen';

const SPORT = '00000000-0000-4000-8000-0000000000f1';
const F5 = '00000000-0000-4000-8000-0000000000f5';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';
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
      districts: [{ id: CANKAYA, slug: 'cankaya', names: { tr: 'Çankaya', en: 'Çankaya' } }],
    },
  ],
};

const mockApi = { fetchMyEvents: jest.fn(), fetchCatalog: jest.fn(), fetchMyAccount: jest.fn() };
jest.mock('./api/my-events-api', () => ({
  fetchMyEvents: (...a: unknown[]) => mockApi.fetchMyEvents(...a),
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

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/my-events',
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

function item(over: Partial<MyEventItem> = {}): MyEventItem {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    title: 'Perşembe maçı',
    sportId: SPORT,
    formatId: F5,
    startsAt: '2026-11-05T16:30:00+00:00',
    durationMinutes: 90,
    cityId: ANKARA,
    districtId: CANKAYA,
    placeLabel: 'ODTÜ Halı Saha 2',
    capacity: 12,
    approvedCount: 1,
    openSlots: 11,
    registrationOpen: true,
    waitlistEnabled: true,
    skillMin: null,
    skillMax: null,
    costAmountMinor: null,
    costNote: null,
    organizerName: 'Ayşe A',
    status: 'PUBLISHED',
    myStatus: 'ORGANIZER',
    pendingCount: 0,
    ...over,
  };
}
const page = (items: MyEventItem[], nextCursor: MyEventsPage['nextCursor'] = null) => ({
  items,
  nextCursor,
});

beforeEach(() => {
  jest.clearAllMocks();
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
  mockApi.fetchMyEvents.mockResolvedValue(page([item()]));
});

describe('MyEventsScreen', () => {
  it('opens on the events I organize, with drafts and pending-request counts marked', async () => {
    mockApi.fetchMyEvents.mockResolvedValue(
      page([
        item({ id: 'a', title: 'Taslak maç', status: 'DRAFT', approvedCount: 0 }),
        item({ id: 'b', title: 'Yayındaki maç', pendingCount: 3 }),
      ]),
    );
    await renderApp(<MyEventsScreen />, { session: signedIn });
    expect(await screen.findByText('Taslak maç')).toBeTruthy();
    expect(mockApi.fetchMyEvents).toHaveBeenCalledWith('ORGANIZING', null);
    expect(screen.getByText('Taslak')).toBeTruthy();
    expect(screen.getByText('3 bekleyen istek')).toBeTruthy();
    expect(screen.getByText('2 etkinlik')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Düzenlediklerim', checked: true })).toBeTruthy();
  });

  it('switches tabs and shows where I stand on each event', async () => {
    await renderApp(<MyEventsScreen />, { session: signedIn });
    await screen.findByText('Perşembe maçı');
    mockApi.fetchMyEvents.mockResolvedValue(
      page([item({ id: 'p', title: 'İstek attığım maç', myStatus: 'REQUESTED' })]),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Bekleyen' }));
    expect(await screen.findByText('İstek attığım maç')).toBeTruthy();
    expect(mockApi.fetchMyEvents).toHaveBeenLastCalledWith('PENDING', null);
    expect(screen.getByText('İstek gönderildi')).toBeTruthy();
    expect(screen.queryByText('Perşembe maçı')).toBeNull();
  });

  it('shows canceled events in the past tab as canceled', async () => {
    await renderApp(<MyEventsScreen />, { session: signedIn });
    await screen.findByText('Perşembe maçı');
    mockApi.fetchMyEvents.mockResolvedValue(
      page([item({ id: 'c', title: 'Yağmurda iptal', status: 'CANCELED' })]),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Geçmiş' }));
    expect(await screen.findByText('Yağmurda iptal')).toBeTruthy();
    expect(screen.getByText('İptal edildi')).toBeTruthy();
  });

  it('offers to create the first event when I organize nothing', async () => {
    mockApi.fetchMyEvents.mockResolvedValue(page([]));
    await renderApp(<MyEventsScreen />, { session: signedIn });
    expect(await screen.findByText('Düzenlediğin etkinlik yok')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Etkinlik oluştur' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/create');
  });

  it('sends me to Discover from the participant tabs when they are empty', async () => {
    mockApi.fetchMyEvents.mockResolvedValue(page([]));
    await renderApp(<MyEventsScreen />, { session: signedIn });
    await screen.findByText('Düzenlediğin etkinlik yok');
    await fireEvent.press(screen.getByRole('radio', { name: 'Yedek' }));
    expect(await screen.findByText('Bekleme listesinde değilsin')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Etkinliklere göz at' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/');
  });

  it('shows a retryable error', async () => {
    mockApi.fetchMyEvents.mockRejectedValueOnce(new AppError('RATE_LIMITED'));
    await renderApp(<MyEventsScreen />, { session: signedIn });
    expect(await screen.findByText('Etkinliklerin yüklenemedi')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
  });

  it('pages with the cursor', async () => {
    const cursor = { starts_at: '2026-11-05T16:30:00+00:00', id: 'cursor-id' };
    mockApi.fetchMyEvents.mockResolvedValueOnce(
      page([item({ id: 'a', title: 'Birinci' })], cursor),
    );
    mockApi.fetchMyEvents.mockResolvedValueOnce(page([item({ id: 'b', title: 'İkinci' })]));
    await renderApp(<MyEventsScreen />, { session: signedIn });
    await screen.findByText('Birinci');
    await fireEvent.press(screen.getByRole('button', { name: 'Daha fazla göster' }));
    expect(await screen.findByText('İkinci')).toBeTruthy();
    expect(mockApi.fetchMyEvents).toHaveBeenLastCalledWith('ORGANIZING', cursor);
  });

  it('does not ask the server anything for a guest: they are sent to sign in', async () => {
    await renderApp(<MyEventsScreen />, { session: { status: 'guest' } });
    expect(await screen.findByTestId('redirect')).toBeTruthy();
    expect(mockApi.fetchMyEvents).not.toHaveBeenCalled();
  });
});
