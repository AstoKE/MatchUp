import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { initI18n } from '@/lib/i18n';
import { renderApp } from '@/test/render';
import { OrganizationsPanel } from './components/OrganizationsPanel';
import { ensureAdminCopy } from './copy';

const mockFetch = jest.fn();
const mockDecide = jest.fn();
jest.mock('./api/admin-api', () => ({
  ...jest.requireActual('./api/admin-api'),
  fetchOrganizationRequests: (...a: unknown[]) => mockFetch(...a),
  decideOrganization: (...a: unknown[]) => mockDecide(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: () => Promise.resolve({ sports: [], cities: [] }),
}));

const admin: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000ad',
  email: 'admin@example.com',
  emailVerified: true,
};
const REQUESTER = '00000000-0000-4000-8000-0000000000c1';
const ORG = '00000000-0000-4000-8000-0000000000d1';
const request = {
  id: ORG,
  name: 'Çankaya Kartalları',
  description: 'Hafta içi akşam halı saha.',
  city_id: '00000000-0000-4000-8000-0000000000a1',
  sport_ids: [],
  status: 'PENDING',
  reject_reason: null,
  created_at: '2026-11-11T10:00:00+00:00',
  decided_at: null,
  requester_id: REQUESTER,
  requester_name: 'Deniz Kaya',
  requester_since: '2026-10-01T10:00:00+00:00',
  requester_events_organized: 3,
  requester_open_reports: 0,
};

// The console loads its own copy (copy.ts); here it is loaded once i18n has started.
beforeAll(() => {
  initI18n('tr');
  ensureAdminCopy();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue([request]);
  mockDecide.mockResolvedValue(undefined);
});

describe('the console: organization requests (Phase 9 / M1)', () => {
  it('shows a waiting request with the requester, and approves it after asking', async () => {
    await renderApp(<OrganizationsPanel onOpenUser={jest.fn()} />, { session: admin });
    expect(await screen.findByText('Hafta içi akşam halı saha.')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith('PENDING');
    expect(screen.getByText(/3 tamamlanmış etkinlik · 0 açık bildirim/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Onayla' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockDecide).toHaveBeenCalledWith(ORG, true, null));
  });

  it('rejects only with a reason, and sends it', async () => {
    await renderApp(<OrganizationsPanel onOpenUser={jest.fn()} />, { session: admin });
    expect(await screen.findByRole('button', { name: 'Reddet', disabled: true })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Red sebebi'), ' İsim taklit ediyor. ');
    await fireEvent.press(screen.getByRole('button', { name: 'Reddet' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockDecide).toHaveBeenCalledWith(ORG, false, 'İsim taklit ediyor.'));
  });

  it('opens the requester', async () => {
    const onOpenUser = jest.fn();
    await renderApp(<OrganizationsPanel onOpenUser={onOpenUser} />, { session: admin });
    await fireEvent.press(await screen.findByRole('button', { name: 'Deniz Kaya' }));
    expect(onOpenUser).toHaveBeenCalledWith(REQUESTER);
  });
});
