import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { Organization } from './api/organizations-api';
import { MyOrganizationsScreen } from './screens/MyOrganizationsScreen';
import { OrganizationRequestScreen } from './screens/OrganizationRequestScreen';

const mockApi = {
  fetchMyOrganizations: jest.fn(),
  requestOrganization: jest.fn(),
  cancelOrganizationRequest: jest.fn(),
  fetchCatalog: jest.fn(),
};
jest.mock('./api/organizations-api', () => ({
  ...jest.requireActual('./api/organizations-api'),
  fetchMyOrganizations: (...a: unknown[]) => mockApi.fetchMyOrganizations(...a),
  requestOrganization: (...a: unknown[]) => mockApi.requestOrganization(...a),
  cancelOrganizationRequest: (...a: unknown[]) => mockApi.cancelOrganizationRequest(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/organizations',
}));

const ANKARA = '00000000-0000-4000-8000-0000000000a1';
const FOOTBALL = '00000000-0000-4000-8000-0000000000f1';
const TENNIS = '00000000-0000-4000-8000-0000000000f2';
const sport = (id: string, slug: string, tr: string) => ({
  id,
  slug,
  names: { tr, en: tr },
  isTeamSport: true,
  skillDescriptors: {},
  positions: [],
  formats: [],
});
const catalog = {
  sports: [sport(FOOTBALL, 'football', 'Futbol'), sport(TENNIS, 'tennis', 'Tenis')],
  cities: [
    {
      id: ANKARA,
      slug: 'ankara',
      names: { tr: 'Ankara', en: 'Ankara' },
      timeZone: 'Europe/Istanbul',
      districts: [],
    },
  ],
};
const signedIn: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'a@example.com',
  emailVerified: true,
};
const organization = (over: Partial<Organization> = {}): Organization => ({
  id: '00000000-0000-4000-8000-0000000000c1',
  name: 'Çankaya Kartalları',
  description: null,
  cityId: ANKARA,
  sportIds: [FOOTBALL],
  status: 'PENDING',
  role: 'OWNER',
  rejectReason: null,
  createdAt: '2026-11-11T10:00:00Z',
  memberCount: 1,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.fetchMyOrganizations.mockResolvedValue({ items: [], maxOwned: 2 });
  mockApi.requestOrganization.mockResolvedValue('00000000-0000-4000-8000-0000000000c9');
  mockApi.cancelOrganizationRequest.mockResolvedValue(undefined);
});

describe('my organizations (Phase 9 / M1)', () => {
  it('shows a waiting request, and withdraws it after asking', async () => {
    mockApi.fetchMyOrganizations.mockResolvedValue({ items: [organization()], maxOwned: 2 });
    await renderApp(<MyOrganizationsScreen />, { session: signedIn });
    expect(await screen.findByText('Çankaya Kartalları')).toBeTruthy();
    expect(await screen.findByText(/Onay bekliyor · Sahibi · Ankara · Futbol/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'İsteği geri çek' }));
    expect(mockApi.cancelOrganizationRequest).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Evet, geri çek' }));
    await waitFor(() =>
      expect(mockApi.cancelOrganizationRequest).toHaveBeenCalledWith(organization().id),
    );
  });

  it('shows why a request was not approved', async () => {
    mockApi.fetchMyOrganizations.mockResolvedValue({
      items: [organization({ status: 'REJECTED', rejectReason: 'İsim taklit ediyor.' })],
      maxOwned: 2,
    });
    await renderApp(<MyOrganizationsScreen />, { session: signedIn });
    expect(await screen.findByText('Onaylanmama sebebi: İsim taklit ediyor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İsteği geri çek' })).toBeNull();
  });

  it('offers a new one below the limit, and says the limit at it', async () => {
    await renderApp(<MyOrganizationsScreen />, { session: signedIn });
    await fireEvent.press(await screen.findByRole('button', { name: 'Organizasyon kur' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/organizations/new');
  });

  it('a rejected request does not count toward the limit', async () => {
    mockApi.fetchMyOrganizations.mockResolvedValue({
      items: [
        organization({ status: 'ACTIVE' }),
        organization({ id: '00000000-0000-4000-8000-0000000000c2', status: 'PENDING' }),
      ],
      maxOwned: 2,
    });
    await renderApp(<MyOrganizationsScreen />, { session: signedIn });
    expect(await screen.findByText(/En fazla 2 organizasyon kurabilirsin/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Organizasyon kur' })).toBeNull();
  });
});

describe('the request form', () => {
  it('needs a name, a province and a sport, then sends and goes back to the list', async () => {
    await renderApp(<OrganizationRequestScreen />, { session: signedIn });
    const send = await screen.findByRole('button', { name: 'İsteği gönder' });
    expect(screen.getByRole('button', { name: 'İsteği gönder', disabled: true })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Adı'), '  Çankaya Kartalları ');
    await fireEvent.press(screen.getByRole('button', { name: 'İl seç' }));
    await fireEvent.press(await screen.findByText('Ankara'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Futbol' }));
    await fireEvent.press(send);
    await waitFor(() =>
      expect(mockApi.requestOrganization).toHaveBeenCalledWith({
        name: 'Çankaya Kartalları',
        description: null,
        cityId: ANKARA,
        sportIds: [FOOTBALL],
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith('/organizations');
  });

  it('shows the refusal at the limit and stays', async () => {
    mockApi.requestOrganization.mockRejectedValue(new AppError('QUOTA_EXCEEDED'));
    await renderApp(<OrganizationRequestScreen />, { session: signedIn });
    await fireEvent.changeText(await screen.findByLabelText('Adı'), 'Kulüp');
    await fireEvent.press(screen.getByRole('button', { name: 'İl seç' }));
    await fireEvent.press(await screen.findByText('Ankara'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Futbol' }));
    await fireEvent.press(screen.getByRole('button', { name: 'İsteği gönder' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
