import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import enBusinesses from '@/locales/en/businesses.json';
import trBusinesses from '@/locales/tr/businesses.json';
import { renderApp } from '@/test/render';
import type { Business } from './api/businesses-api';
import { BusinessRequestScreen } from './screens/BusinessRequestScreen';
import { MyBusinessesScreen } from './screens/MyBusinessesScreen';

const mockApi = {
  fetchMyBusinesses: jest.fn(),
  requestBusiness: jest.fn(),
  cancelBusinessRequest: jest.fn(),
  searchClaimableVenues: jest.fn(),
};
jest.mock('./api/businesses-api', () => ({
  ...jest.requireActual('./api/businesses-api'),
  fetchMyBusinesses: (...a: unknown[]) => mockApi.fetchMyBusinesses(...a),
  requestBusiness: (...a: unknown[]) => mockApi.requestBusiness(...a),
  cancelBusinessRequest: (...a: unknown[]) => mockApi.cancelBusinessRequest(...a),
  searchClaimableVenues: (...a: unknown[]) => mockApi.searchClaimableVenues(...a),
}));
const ANKARA = '00000000-0000-4000-8000-0000000000a1';
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: () =>
    Promise.resolve({
      sports: [],
      cities: [
        {
          id: '00000000-0000-4000-8000-0000000000a1',
          slug: 'ankara',
          names: { tr: 'Ankara', en: 'Ankara' },
          timeZone: 'Europe/Istanbul',
          districts: [],
        },
      ],
    }),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/businesses',
}));

const me: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'a@example.com',
  emailVerified: true,
};
const VENUE = {
  id: '00000000-0000-4000-8000-0000000000c1',
  name: 'Yıldız Halı Saha',
  kind: 'COMMERCIAL_FACILITY',
};
const business = (over: Partial<Business> = {}): Business => ({
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'Yıldız Spor Tesisleri',
  cityId: ANKARA,
  status: 'PENDING',
  role: 'OWNER',
  rejectReason: null,
  createdAt: '2026-11-12T10:00:00Z',
  venues: [{ id: VENUE.id, name: VENUE.name }],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchMyBusinesses.mockResolvedValue({ items: [], maxOwned: 3 });
  mockApi.requestBusiness.mockResolvedValue('00000000-0000-4000-8000-0000000000b9');
  mockApi.cancelBusinessRequest.mockResolvedValue(undefined);
  mockApi.searchClaimableVenues.mockResolvedValue([VENUE]);
});

describe('my businesses (Phase 10 / M1)', () => {
  it('shows a waiting request with its facilities, and withdraws it after asking', async () => {
    mockApi.fetchMyBusinesses.mockResolvedValue({ items: [business()], maxOwned: 3 });
    await renderApp(<MyBusinessesScreen />, { session: me });
    expect(await screen.findByText('Yıldız Spor Tesisleri')).toBeTruthy();
    expect(screen.getByText('Tesisler: Yıldız Halı Saha')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'İsteği geri çek' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet, geri çek' }));
    await waitFor(() => expect(mockApi.cancelBusinessRequest).toHaveBeenCalledWith(business().id));
  });

  it('shows why a request was not approved', async () => {
    mockApi.fetchMyBusinesses.mockResolvedValue({
      items: [business({ status: 'REJECTED', rejectReason: 'Tesisle iletişim kurulamadı.' })],
      maxOwned: 3,
    });
    await renderApp(<MyBusinessesScreen />, { session: me });
    expect(
      await screen.findByText('Onaylanmama sebebi: Tesisle iletişim kurulamadı.'),
    ).toBeTruthy();
  });

  it('says the limit instead of offering a new one at it', async () => {
    mockApi.fetchMyBusinesses.mockResolvedValue({
      items: [
        business(),
        business({ id: '00000000-0000-4000-8000-0000000000b2', status: 'ACTIVE' }),
        business({ id: '00000000-0000-4000-8000-0000000000b3' }),
      ],
      maxOwned: 3,
    });
    await renderApp(<MyBusinessesScreen />, { session: me });
    expect(await screen.findByText(/En fazla 3 işletme/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İşletme ekle' })).toBeNull();
  });
});

describe('the business request', () => {
  const fill = async () => {
    await fireEvent.changeText(await screen.findByLabelText('İşletmenin adı'), ' Yıldız Spor ');
    await fireEvent.press(screen.getByRole('button', { name: 'İl seç' }));
    await fireEvent.press(await screen.findByText('Ankara'));
  };

  it('needs a contact, finds facilities by name, then sends and goes back', async () => {
    await renderApp(<BusinessRequestScreen />, { session: me });
    await fill();
    expect(screen.getByRole('button', { name: 'İsteği gönder', disabled: true })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('İletişim telefonu'), '0532 111 22 33');
    await fireEvent.changeText(screen.getByLabelText('Tesislerini ara'), 'Yıldız');
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Yıldız Halı Saha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'İsteği gönder' }));
    await waitFor(() =>
      expect(mockApi.requestBusiness).toHaveBeenCalledWith({
        name: 'Yıldız Spor',
        cityId: ANKARA,
        contactPhone: '0532 111 22 33',
        contactEmail: null,
        message: null,
        venueIds: [VENUE.id],
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith('/businesses');
  });

  it('shows a refusal (a facility already claimed) and stays', async () => {
    mockApi.requestBusiness.mockRejectedValue(new AppError('VENUE_CLAIMED'));
    await renderApp(<BusinessRequestScreen />, { session: me });
    await fill();
    await fireEvent.changeText(screen.getByLabelText('İletişim e-postası'), 'a@ornek.com');
    await fireEvent.press(screen.getByRole('button', { name: 'İsteği gönder' }));
    expect(await screen.findByText(/zaten bir işletmesi var/)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('has the same keys in Turkish and English', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? keys(v as object, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    expect(keys(enBusinesses).sort()).toEqual(keys(trBusinesses).sort());
  });
});
