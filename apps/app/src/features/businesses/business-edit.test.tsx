import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { OwnedBusiness } from './api/businesses-api';
import { BusinessEditScreen } from './screens/BusinessEditScreen';

const mockApi = {
  fetchMyBusiness: jest.fn(),
  updateMyBusiness: jest.fn(),
  updateBusinessVenue: jest.fn(),
};
jest.mock('./api/businesses-api', () => ({
  ...jest.requireActual('./api/businesses-api'),
  fetchMyBusiness: (...a: unknown[]) => mockApi.fetchMyBusiness(...a),
  updateMyBusiness: (...a: unknown[]) => mockApi.updateMyBusiness(...a),
  updateBusinessVenue: (...a: unknown[]) => mockApi.updateBusinessVenue(...a),
}));
const FOOTBALL = '00000000-0000-4000-8000-0000000000f1';
const FUTSAL = '00000000-0000-4000-8000-0000000000f2';
const sport = (id: string, tr: string) => ({
  id,
  slug: tr.toLowerCase(),
  names: { tr, en: tr },
  isTeamSport: true,
  skillDescriptors: {},
  positions: [],
  formats: [],
});
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: () =>
    Promise.resolve({
      sports: [
        sport('00000000-0000-4000-8000-0000000000f1', 'Futbol'),
        sport('00000000-0000-4000-8000-0000000000f2', 'Futsal'),
      ],
      cities: [],
    }),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true };
const BUSINESS = '00000000-0000-4000-8000-0000000000b1';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: '00000000-0000-4000-8000-0000000000b1' }),
  usePathname: () => '/businesses/x',
}));

const me: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'a@example.com',
  emailVerified: true,
};
const VENUE = '00000000-0000-4000-8000-0000000000c1';
const owned = (over: Partial<OwnedBusiness> = {}): OwnedBusiness => ({
  id: BUSINESS,
  name: 'Yıldız Spor',
  cityId: '00000000-0000-4000-8000-0000000000a1',
  contactPhone: '05321112233',
  contactEmail: null,
  venues: [
    {
      id: VENUE,
      name: 'Yıldız Halı Saha',
      addressText: null,
      verified: true,
      listed: true,
      sportIds: [FOOTBALL],
    },
  ],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchMyBusiness.mockResolvedValue(owned());
  mockApi.updateMyBusiness.mockResolvedValue(undefined);
  mockApi.updateBusinessVenue.mockResolvedValue(undefined);
});

describe('editing a business (Phase 10 / M3)', () => {
  it('saves the business name and contact', async () => {
    await renderApp(<BusinessEditScreen />, { session: me });
    await fireEvent.changeText(
      await screen.findByDisplayValue('Yıldız Spor'),
      'Yıldız Spor Tesisleri',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'İşletmeyi kaydet' }));
    await waitFor(() =>
      expect(mockApi.updateMyBusiness).toHaveBeenCalledWith({
        id: BUSINESS,
        name: 'Yıldız Spor Tesisleri',
        contactPhone: '05321112233',
        contactEmail: null,
      }),
    );
    expect(await screen.findByText('Kaydedildi.')).toBeTruthy();
  });

  it('cannot save the business without any contact', async () => {
    await renderApp(<BusinessEditScreen />, { session: me });
    await fireEvent.changeText(await screen.findByDisplayValue('05321112233'), '');
    expect(screen.getByRole('button', { name: 'İşletmeyi kaydet', disabled: true })).toBeTruthy();
  });

  it("saves a facility's name, address and sports, and says it is verified", async () => {
    await renderApp(<BusinessEditScreen />, { session: me });
    expect(await screen.findByText('Doğrulanmış tesis')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Adres (isteğe bağlı)'), 'Üniversiteler Mh.');
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Futsal' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tesisi kaydet' }));
    await waitFor(() =>
      expect(mockApi.updateBusinessVenue).toHaveBeenCalledWith({
        businessId: BUSINESS,
        venueId: VENUE,
        name: 'Yıldız Halı Saha',
        addressText: 'Üniversiteler Mh.',
        sportIds: [FOOTBALL, FUTSAL],
      }),
    );
  });

  it('shows a refusal from the server', async () => {
    mockApi.updateMyBusiness.mockRejectedValue(new AppError('VALIDATION_FAILED'));
    await renderApp(<BusinessEditScreen />, { session: me });
    await fireEvent.press(await screen.findByRole('button', { name: 'İşletmeyi kaydet' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
