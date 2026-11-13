import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import enInvite from '@/locales/en/business-invite.json';
import trInvite from '@/locales/tr/business-invite.json';
import { renderApp } from '@/test/render';
import type { Business, OwnedBusiness } from './api/businesses-api';
import { InviteToBusiness } from './components/InviteToBusiness';
import { BusinessEditScreen } from './screens/BusinessEditScreen';
import { MyBusinessesScreen } from './screens/MyBusinessesScreen';

const mockApi = {
  fetchMyBusinesses: jest.fn(),
  fetchMyBusiness: jest.fn(),
  respondBusinessInvite: jest.fn(),
  leaveBusiness: jest.fn(),
  removeBusinessStaff: jest.fn(),
  fetchBusinessesToInvite: jest.fn(),
  inviteBusinessStaff: jest.fn(),
};
jest.mock('./api/businesses-api', () => ({
  ...jest.requireActual('./api/businesses-api'),
  fetchMyBusinesses: (...a: unknown[]) => mockApi.fetchMyBusinesses(...a),
  fetchMyBusiness: (...a: unknown[]) => mockApi.fetchMyBusiness(...a),
  respondBusinessInvite: (...a: unknown[]) => mockApi.respondBusinessInvite(...a),
  leaveBusiness: (...a: unknown[]) => mockApi.leaveBusiness(...a),
  removeBusinessStaff: (...a: unknown[]) => mockApi.removeBusinessStaff(...a),
}));
jest.mock('./api/invite-api', () => ({
  fetchBusinessesToInvite: (...a: unknown[]) => mockApi.fetchBusinessesToInvite(...a),
  inviteBusinessStaff: (...a: unknown[]) => mockApi.inviteBusinessStaff(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: () => Promise.resolve({ sports: [], cities: [] }),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true };
const BUSINESS = '00000000-0000-4000-8000-0000000000b1';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: '00000000-0000-4000-8000-0000000000b1' }),
  usePathname: () => '/businesses',
}));

const me: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'a@example.com',
  emailVerified: true,
};
const STAFF = '00000000-0000-4000-8000-0000000000c2';
const listed = (over: Partial<Business> = {}): Business => ({
  id: BUSINESS,
  name: 'Yıldız Spor',
  cityId: '00000000-0000-4000-8000-0000000000a1',
  status: 'ACTIVE',
  role: 'STAFF',
  rejectReason: null,
  createdAt: '2026-11-12T10:00:00Z',
  venues: [],
  membership: 'ACTIVE',
  ...over,
});
const owned = (over: Partial<OwnedBusiness> = {}): OwnedBusiness => ({
  id: BUSINESS,
  name: 'Yıldız Spor',
  cityId: '00000000-0000-4000-8000-0000000000a1',
  role: 'OWNER',
  staff: [{ userId: STAFF, displayName: 'Deniz Kaya', status: 'ACTIVE' }],
  contactPhone: '05321112233',
  contactEmail: null,
  venues: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(mockApi)) fn.mockResolvedValue(undefined);
});

describe('business staff (Phase 10 / M4)', () => {
  it('an invited person accepts from their list', async () => {
    mockApi.fetchMyBusinesses.mockResolvedValue({
      items: [listed({ membership: 'INVITED' })],
      maxOwned: 3,
    });
    await renderApp(<MyBusinessesScreen />, { session: me });
    await fireEvent.press(await screen.findByRole('button', { name: 'Kabul et' }));
    await waitFor(() => expect(mockApi.respondBusinessInvite).toHaveBeenCalledWith(BUSINESS, true));
  });

  it('a staff member opens the facilities, or leaves after asking', async () => {
    mockApi.fetchMyBusinesses.mockResolvedValue({ items: [listed()], maxOwned: 3 });
    await renderApp(<MyBusinessesScreen />, { session: me });
    await fireEvent.press(await screen.findByRole('button', { name: 'Tesisleri düzenle' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/businesses/[id]',
      params: { id: BUSINESS },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Ayrıl' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet, ayrıl' }));
    await waitFor(() => expect(mockApi.leaveBusiness).toHaveBeenCalledWith(BUSINESS));
  });

  it('the owner sees the staff and removes one', async () => {
    mockApi.fetchMyBusiness.mockResolvedValue(owned());
    await renderApp(<BusinessEditScreen />, { session: me });
    expect(await screen.findByText('Deniz Kaya')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Çıkar' }));
    await waitFor(() => expect(mockApi.removeBusinessStaff).toHaveBeenCalledWith(BUSINESS, STAFF));
  });

  it('staff do not see the business form or the staff list', async () => {
    mockApi.fetchMyBusiness.mockResolvedValue(
      owned({ role: 'STAFF', staff: null, contactPhone: null }),
    );
    await renderApp(<BusinessEditScreen />, { session: me });
    expect(await screen.findByText('Tesisler')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İşletmeyi kaydet' })).toBeNull();
    expect(screen.queryByText('Çalışanlar')).toBeNull();
  });
});

describe('the staff invitation on a player card', () => {
  it('shows nothing to someone who owns no business', async () => {
    mockApi.fetchBusinessesToInvite.mockResolvedValue([]);
    await renderApp(<InviteToBusiness userId={STAFF} name="Deniz Kaya" />, { session: me });
    await waitFor(() => expect(mockApi.fetchBusinessesToInvite).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'İşletmeye çalışan olarak ekle' })).toBeNull();
  });

  it('invites to a business the viewer owns', async () => {
    mockApi.fetchBusinessesToInvite.mockResolvedValue([
      { id: BUSINESS, name: 'Yıldız Spor', membership: null },
    ]);
    mockApi.inviteBusinessStaff.mockResolvedValue('INVITED');
    await renderApp(<InviteToBusiness userId={STAFF} name="Deniz Kaya" />, { session: me });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'İşletmeye çalışan olarak ekle' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Davet et (Yıldız Spor)' }));
    await waitFor(() => expect(mockApi.inviteBusinessStaff).toHaveBeenCalledWith(BUSINESS, STAFF));
    expect(await screen.findByText('Deniz Kaya davet edildi.')).toBeTruthy();
  });

  it('has the same keys in Turkish and English', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? keys(v as object, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    expect(keys(enInvite).sort()).toEqual(keys(trInvite).sort());
  });
});
