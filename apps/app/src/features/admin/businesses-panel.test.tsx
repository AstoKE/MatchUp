import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { initI18n } from '@/lib/i18n';
import { renderApp } from '@/test/render';
import { BusinessesPanel } from './components/BusinessesPanel';
import { ensureAdminCopy } from './copy';

const mockFetch = jest.fn();
const mockDecide = jest.fn();
const mockCreate = jest.fn();
const mockHide = jest.fn();
const mockUsers = jest.fn();
const mockVenues = jest.fn();
jest.mock('./api/admin-api', () => ({
  ...jest.requireActual('./api/admin-api'),
  fetchBusinessRequests: (...a: unknown[]) => mockFetch(...a),
  decideBusiness: (...a: unknown[]) => mockDecide(...a),
  createBusiness: (...a: unknown[]) => mockCreate(...a),
  setBusinessHidden: (...a: unknown[]) => mockHide(...a),
  searchUsers: (...a: unknown[]) => mockUsers(...a),
  searchCommercialVenues: (...a: unknown[]) => mockVenues(...a),
}));
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

const admin: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000ad',
  email: 'admin@example.com',
  emailVerified: true,
};
const REQUESTER = '00000000-0000-4000-8000-0000000000c1';
const BUSINESS = '00000000-0000-4000-8000-0000000000b1';
const request = {
  id: BUSINESS,
  name: 'Yıldız Spor Tesisleri',
  city_id: '00000000-0000-4000-8000-0000000000a1',
  status: 'PENDING',
  reject_reason: null,
  created_at: '2026-11-12T10:00:00+00:00',
  venues: [{ id: '00000000-0000-4000-8000-0000000000e1', name: 'Yıldız Halı Saha' }],
  contact_phone: '05321112233',
  contact_email: null,
  message: 'Tesis müdürüyüm.',
  requester_id: REQUESTER,
  requester_name: 'Deniz Kaya',
  requester_since: '2026-10-01T10:00:00+00:00',
  requester_open_reports: 0,
};

beforeAll(() => {
  initI18n('tr');
  ensureAdminCopy();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue([request]);
  mockDecide.mockResolvedValue(undefined);
  mockCreate.mockResolvedValue('00000000-0000-4000-8000-0000000000b9');
  mockHide.mockResolvedValue(undefined);
  mockUsers.mockResolvedValue([{ id: REQUESTER, name: 'Deniz Kaya', account_status: 'ACTIVE' }]);
  mockVenues.mockResolvedValue([]);
});

describe('the console: business requests (Phase 10 / M1)', () => {
  it('shows the contact details and claimed facilities, and approves after asking', async () => {
    await renderApp(<BusinessesPanel onOpenUser={jest.fn()} />, { session: admin });
    expect(await screen.findByText('İletişim: 05321112233')).toBeTruthy();
    expect(screen.getByText('Sahiplenilen tesisler: Yıldız Halı Saha')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith('PENDING');
    await fireEvent.press(screen.getByRole('button', { name: 'Onayla' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockDecide).toHaveBeenCalledWith(BUSINESS, true, null));
  });

  it('rejects only with a reason', async () => {
    await renderApp(<BusinessesPanel onOpenUser={jest.fn()} />, { session: admin });
    expect(await screen.findByRole('button', { name: 'Reddet', disabled: true })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Red sebebi'), 'Tesisle iletişim kurulamadı.');
    await fireEvent.press(screen.getByRole('button', { name: 'Reddet' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() =>
      expect(mockDecide).toHaveBeenCalledWith(BUSINESS, false, 'Tesisle iletişim kurulamadı.'),
    );
  });

  it('hides an active business only with a note (M2)', async () => {
    mockFetch.mockResolvedValue([{ ...request, status: 'ACTIVE' }]);
    await renderApp(<BusinessesPanel onOpenUser={jest.fn()} />, { session: admin });
    expect(await screen.findByRole('button', { name: 'Gizle', disabled: true })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Not (gerekli)'), 'Şikayet incelemede.');
    await fireEvent.press(screen.getByRole('button', { name: 'Gizle' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() =>
      expect(mockHide).toHaveBeenCalledWith(BUSINESS, true, 'Şikayet incelemede.'),
    );
  });

  it('adds a business directly with its owner (P-19)', async () => {
    mockFetch.mockResolvedValue([]);
    await renderApp(<BusinessesPanel onOpenUser={jest.fn()} />, { session: admin });
    await fireEvent.press(await screen.findByRole('button', { name: 'İşletme ekle' }));
    await fireEvent.changeText(screen.getByLabelText('İşletmenin adı'), 'Yıldız Spor');
    await fireEvent.changeText(screen.getByLabelText('Sahibini ara (ad)'), 'Deniz');
    await fireEvent.press(screen.getByRole('button', { name: 'Ara' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Deniz Kaya' }));
    expect(screen.getByText('Sahibi: Deniz Kaya')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'İşletmeyi ekle', disabled: true })).toBeTruthy();
  });
});
