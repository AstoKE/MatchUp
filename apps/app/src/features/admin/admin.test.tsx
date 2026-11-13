import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import enAdmin from '@/locales/en/admin.json';
import trAdmin from '@/locales/tr/admin.json';
import { renderApp } from '@/test/render';
import AdminGate from './AdminGate';

const ME = '00000000-0000-4000-8000-0000000000aa';
const TARGET = '00000000-0000-4000-8000-0000000000bb';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const REPORT = '00000000-0000-4000-8000-0000000000c1';

const mockApi = {
  fetchDashboardSummary: jest.fn(),
  fetchAdminSecurity: jest.fn(),
  enrollTotp: jest.fn(),
  verifyTotp: jest.fn(),
  fetchReports: jest.fn(),
  fetchReport: jest.fn(),
  resolveReport: jest.fn(),
  suspendUser: jest.fn(),
  cancelEvent: jest.fn(),
  fetchActions: jest.fn(),
  fetchFlags: jest.fn(),
  fetchDisputes: jest.fn(),
  fetchMyAccount: jest.fn(),
  fetchVenues: jest.fn(),
  setVenueStatus: jest.fn(),
  addVenue: jest.fn(),
  fetchCatalog: jest.fn(),
  fetchPilotMetrics: jest.fn(),
};
jest.mock('./api/admin-api', () => ({
  fetchDashboardSummary: (...a: unknown[]) => mockApi.fetchDashboardSummary(...a),
  fetchAdminSecurity: (...a: unknown[]) => mockApi.fetchAdminSecurity(...a),
  enrollTotp: (...a: unknown[]) => mockApi.enrollTotp(...a),
  verifyTotp: (...a: unknown[]) => mockApi.verifyTotp(...a),
  fetchReports: (...a: unknown[]) => mockApi.fetchReports(...a),
  fetchReport: (...a: unknown[]) => mockApi.fetchReport(...a),
  resolveReport: (...a: unknown[]) => mockApi.resolveReport(...a),
  suspendUser: (...a: unknown[]) => mockApi.suspendUser(...a),
  cancelEvent: (...a: unknown[]) => mockApi.cancelEvent(...a),
  fetchActions: (...a: unknown[]) => mockApi.fetchActions(...a),
  fetchFlags: (...a: unknown[]) => mockApi.fetchFlags(...a),
  fetchDisputes: (...a: unknown[]) => mockApi.fetchDisputes(...a),
  fetchVenues: (...a: unknown[]) => mockApi.fetchVenues(...a),
  setVenueStatus: (...a: unknown[]) => mockApi.setVenueStatus(...a),
  addVenue: (...a: unknown[]) => mockApi.addVenue(...a),
  fetchPilotMetrics: (...a: unknown[]) => mockApi.fetchPilotMetrics(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));
const ANKARA = '00000000-0000-4000-8000-0000000000a1';
const CANKAYA = '00000000-0000-4000-8000-0000000000a2';
const FOOTBALL = '00000000-0000-4000-8000-0000000000f1';
const VENUE = '00000000-0000-4000-8000-0000000000b1';
const catalog = {
  sports: [
    {
      id: FOOTBALL,
      slug: 'football',
      names: { tr: 'Futbol', en: 'Football' },
      isTeamSport: true,
      skillDescriptors: {},
      positions: [],
      formats: [],
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
const venue = (over: Record<string, unknown> = {}) => ({
  id: VENUE,
  name: 'Yıldız Halı Saha',
  kind: 'COMMERCIAL_FACILITY',
  city_id: ANKARA,
  district_id: CANKAYA,
  address_text: 'Üniversiteler Mh.',
  point: { lat: 39.895, lon: 32.7795 },
  verified: false,
  sport_ids: [FOOTBALL],
  provenance: 'USER_SUBMITTED',
  hidden: false,
  created_at: '2026-11-05T10:00:00+00:00',
  submitted_by: TARGET,
  submitter_name: 'Deniz Kaya',
  open_reports: 0,
  events: 2,
  ...over,
});
jest.mock('@/features/onboarding/api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockApi.fetchMyAccount(...a),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  acceptCurrentLegalTerms: jest.fn(),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    Link: jest.requireActual<typeof import('@/test/link-mock')>('@/test/link-mock').LinkMock,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/admin',
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{String(href)}</Text>,
  };
});

const session: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'a@example.com',
  emailVerified: true,
};
const account = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  status: 'ACTIVE',
  emailVerified: true,
  isAdmin: true,
  adultConfirmed: true,
  onboarded: true,
  legalConsentCurrent: true,
  deletionDueAt: null,
  ...over,
});
const item = (over: Record<string, unknown> = {}) => ({
  id: REPORT,
  target_type: 'USER',
  target_id: TARGET,
  target_label: 'Deniz Kaya',
  reason: 'SPAM',
  status: 'OPEN',
  created_at: '2026-11-04T10:00:00+00:00',
  handled_at: null,
  reporter_id: ME,
  reporter_name: 'Ece Yılmaz',
  open_for_target: 1,
  ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  ...item(),
  details: 'Reklam yapıyor',
  target: { id: TARGET, name: 'Deniz Kaya', account_status: 'ACTIVE', is_admin: false },
  others: [],
  history: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchDashboardSummary.mockResolvedValue({
    generated_at: '2026-11-13T10:00:00Z',
    reports: {
      count: 1,
      oldest_at: null,
      by_type: { USER: 1, EVENT: 0, VENUE: 0, ORGANIZATION: 0 },
    },
    organization_requests: { count: 0, oldest_at: null },
    business_requests: { count: 0, oldest_at: null },
    feedback: { count: 0, oldest_at: null },
    disputes: { count: 0, oldest_at: null },
    flags: { count: 0 },
    recent_actions: [],
  });
  mockApi.fetchMyAccount.mockResolvedValue(account());
  mockApi.fetchAdminSecurity.mockResolvedValue({ secondFactorDone: true, factorId: 'f1' });
  mockApi.fetchReports.mockResolvedValue({ items: [item()], next_cursor: null });
  mockApi.fetchReport.mockResolvedValue(detail());
  mockApi.resolveReport.mockResolvedValue(undefined);
  mockApi.suspendUser.mockResolvedValue(undefined);
  mockApi.cancelEvent.mockResolvedValue(undefined);
  mockApi.verifyTotp.mockResolvedValue(undefined);
  mockApi.enrollTotp.mockResolvedValue({
    factorId: 'f2',
    qrCode: 'data:image/svg+xml;utf8,<svg/>',
    secret: 'JBSWY3DPEHPK3PXP',
  });
  mockRouter.canGoBack.mockReturnValue(true);
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.fetchVenues.mockResolvedValue({ items: [venue()], next_cursor: null });
  mockApi.setVenueStatus.mockResolvedValue(true);
  mockApi.addVenue.mockResolvedValue(VENUE);
});

describe('who gets in', () => {
  it('shows someone who is no administrator the page of a missing route, and asks the server nothing', async () => {
    mockApi.fetchMyAccount.mockResolvedValue(account({ isAdmin: false }));
    await renderApp(<AdminGate />, { session });
    expect(await screen.findByText('Aradığın içerik bulunamadı.')).toBeTruthy();
    expect(mockApi.fetchAdminSecurity).not.toHaveBeenCalled();
    expect(mockApi.fetchReports).not.toHaveBeenCalled();
  });

  it('sends a guest to sign-in', async () => {
    await renderApp(<AdminGate />, { session: { status: 'guest' } });
    expect(await screen.findByTestId('redirect')).toBeTruthy();
    expect(mockApi.fetchMyAccount).not.toHaveBeenCalled();
  });

  it('helps an administrator with no authenticator to set one up, and takes the code', async () => {
    mockApi.fetchAdminSecurity.mockResolvedValue({ secondFactorDone: false, factorId: null });
    await renderApp(<AdminGate />, { session });
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    expect(screen.getByLabelText('Doğrulama uygulaması için QR kodu')).toBeTruthy();
    const verify = screen.getByRole('button', { name: 'Doğrula' });
    expect(verify.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('6 haneli kod'), '12 34a56');
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrula' }));
    await waitFor(() => expect(mockApi.verifyTotp).toHaveBeenCalledWith('f2', '123456'));
  });

  it('asks an administrator who has one for the code, and says when it is wrong', async () => {
    mockApi.fetchAdminSecurity.mockResolvedValue({ secondFactorDone: false, factorId: 'f1' });
    mockApi.verifyTotp.mockRejectedValue(new Error('bad'));
    await renderApp(<AdminGate />, { session });
    expect(await screen.findByRole('heading', { name: 'İkinci doğrulama' })).toBeTruthy();
    expect(mockApi.enrollTotp).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('6 haneli kod'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrula' }));
    expect(await screen.findByText(/Kod yanlış ya da süresi dolmuş/)).toBeTruthy();
  });
});

describe('the queue', () => {
  it('lists the open reports, with what a moderator needs to choose one', async () => {
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aç: Bildirimler (açık)' }));
    expect(await screen.findByRole('button', { name: /Kişi · Deniz Kaya/ })).toBeTruthy();
    expect(mockApi.fetchReports).toHaveBeenCalledWith('OPEN', null);
  });

  it('dismisses a report in three taps: open it, dismiss, confirm', async () => {
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aç: Bildirimler (açık)' }));
    await fireEvent.press(await screen.findByRole('button', { name: /Kişi · Deniz Kaya/ }));
    expect(await screen.findByText('Reklam yapıyor')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reddet' }));
    expect(screen.getByText('Emin misin?')).toBeTruthy();
    expect(mockApi.resolveReport).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() =>
      expect(mockApi.resolveReport).toHaveBeenCalledWith(REPORT, 'DISMISSED', ''),
    );
  });

  it('suspends and closes only with a note, and suspends before it closes', async () => {
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aç: Bildirimler (açık)' }));
    await fireEvent.press(await screen.findByRole('button', { name: /Kişi · Deniz Kaya/ }));
    await screen.findByText('Reklam yapıyor');
    expect(
      screen.getByRole('button', { name: 'Askıya al ve kapat' }).props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Karar notu'), 'Tekrarlanan reklam');
    await fireEvent.press(screen.getByRole('button', { name: 'Askıya al ve kapat' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() =>
      expect(mockApi.suspendUser).toHaveBeenCalledWith(TARGET, 'Tekrarlanan reklam'),
    );
    await waitFor(() =>
      expect(mockApi.resolveReport).toHaveBeenCalledWith(REPORT, 'ACTIONED', 'Tekrarlanan reklam'),
    );
    expect(mockApi.suspendUser.mock.invocationCallOrder[0]!).toBeLessThan(
      mockApi.resolveReport.mock.invocationCallOrder[0]!,
    );
  });

  it('does not close the report when the suspension was refused', async () => {
    mockApi.suspendUser.mockRejectedValue(new Error('refused'));
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aç: Bildirimler (açık)' }));
    await fireEvent.press(await screen.findByRole('button', { name: /Kişi · Deniz Kaya/ }));
    await screen.findByText('Reklam yapıyor');
    await fireEvent.changeText(screen.getByLabelText('Karar notu'), 'Neden');
    await fireEvent.press(screen.getByRole('button', { name: 'Askıya al ve kapat' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockApi.suspendUser).toHaveBeenCalled());
    expect(mockApi.resolveReport).not.toHaveBeenCalled();
  });

  it('offers to cancel the event of an event report', async () => {
    mockApi.fetchReports.mockResolvedValue({
      items: [item({ target_type: 'EVENT', target_id: EVENT, target_label: 'Sahte maç' })],
      next_cursor: null,
    });
    mockApi.fetchReport.mockResolvedValue(
      detail({
        target_type: 'EVENT',
        target_id: EVENT,
        target_label: 'Sahte maç',
        target: {
          id: EVENT,
          name: 'Sahte maç',
          status: 'PUBLISHED',
          approved_count: 2,
          capacity: 10,
        },
      }),
    );
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aç: Bildirimler (açık)' }));
    await fireEvent.press(await screen.findByRole('button', { name: /Etkinlik · Sahte maç/ }));
    await screen.findByText('Katılım 2/10');
    await fireEvent.changeText(screen.getByLabelText('Karar notu'), 'Sahte');
    await fireEvent.press(screen.getByRole('button', { name: 'Etkinliği iptal et ve kapat' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockApi.cancelEvent).toHaveBeenCalledWith(EVENT, 'Sahte'));
  });

  it('says so when nothing is open', async () => {
    mockApi.fetchReports.mockResolvedValue({ items: [], next_cursor: null });
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aç: Bildirimler (açık)' }));
    expect(await screen.findByText('Açık bildirim yok.')).toBeTruthy();
  });
});

describe('venues', () => {
  const openVenues = async () => {
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Mekânlar' }));
  };

  it('shows the queue with where it is and who suggested it, and verifies after a confirmation', async () => {
    await openVenues();
    expect(await screen.findByText('Yıldız Halı Saha · İşletme')).toBeTruthy();
    expect(mockApi.fetchVenues).toHaveBeenCalledWith('UNVERIFIED', null);
    // The district line waits for the catalog, which may arrive after the venue list.
    expect(await screen.findByText('Çankaya, Ankara · Üniversiteler Mh.')).toBeTruthy();
    expect(screen.getByText(/Öneren: Deniz Kaya/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Doğrula' }));
    expect(mockApi.setVenueStatus).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockApi.setVenueStatus).toHaveBeenCalledWith(VENUE, 'VERIFY', ''));
  });

  it('restores a hidden venue instead of hiding it', async () => {
    mockApi.fetchVenues.mockResolvedValue({ items: [venue({ hidden: true })], next_cursor: null });
    await openVenues();
    await screen.findByText('Yıldız Halı Saha · İşletme');
    expect(screen.queryByRole('button', { name: 'Gizle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Doğrula' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Geri getir' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockApi.setVenueStatus).toHaveBeenCalledWith(VENUE, 'RESTORE', ''));
  });

  it('adds a venue from typed coordinates, and says what is missing first', async () => {
    await openVenues();
    await fireEvent.press(await screen.findByRole('button', { name: 'Mekân ekle' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ekle' }));
    expect(screen.getByText('Ad, il, ilçe, koordinat ve en az bir spor gerekli.')).toBeTruthy();
    expect(mockApi.addVenue).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Ad'), 'Belediye Spor Kompleksi');
    await fireEvent.press(screen.getByRole('button', { name: /^İl:/ }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Ankara' }));
    await fireEvent.press(screen.getByRole('button', { name: /^İlçe:/ }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Çankaya' }));
    await fireEvent.changeText(screen.getByLabelText('Koordinat (enlem, boylam)'), 'kuzey');
    expect(screen.getByText('Enlem ve boylamı virgülle ayırarak yaz.')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText('Koordinat (enlem, boylam)'),
      '39.8950, 32.7795',
    );
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Futbol' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ekle' }));
    await waitFor(() =>
      expect(mockApi.addVenue).toHaveBeenCalledWith({
        kind: 'COMMERCIAL_FACILITY',
        name: 'Belediye Spor Kompleksi',
        cityId: ANKARA,
        districtId: CANKAYA,
        point: { lat: 39.895, lon: 32.7795 },
        addressText: '',
        sportIds: [FOOTBALL],
        sourceRef: '',
      }),
    );
  });

  it('hides a reported venue and then closes the report', async () => {
    mockApi.fetchReports.mockResolvedValue({
      items: [item({ target_type: 'VENUE', target_id: VENUE, target_label: 'Yıldız Halı Saha' })],
      next_cursor: null,
    });
    mockApi.fetchReport.mockResolvedValue(
      detail({
        target_type: 'VENUE',
        target_id: VENUE,
        target_label: 'Yıldız Halı Saha',
        target: { id: VENUE, name: 'Yıldız Halı Saha', listing_status: 'ACTIVE', verified: false },
      }),
    );
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Aç: Bildirimler (açık)' }));
    await fireEvent.press(await screen.findByRole('button', { name: /Mekân · Yıldız Halı Saha/ }));
    expect(await screen.findByText('Yıldız Halı Saha · Listede')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Mekânı gizle ve kapat' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(mockApi.resolveReport).toHaveBeenCalled());
    expect(mockApi.setVenueStatus).toHaveBeenCalledWith(VENUE, 'HIDE', '');
    expect(mockApi.setVenueStatus.mock.invocationCallOrder[0]).toBeLessThan(
      mockApi.resolveReport.mock.invocationCallOrder[0]!,
    );
  });
});

describe('the pilot dashboard', () => {
  it('shows totals, rates, provinces and consented usage, and changes the period', async () => {
    mockApi.fetchPilotMetrics.mockResolvedValue({
      days: 30,
      players: { onboarded: 120, new: 40, organized: 12, joined: 55, analytics_consent: 9 },
      events: { published: 30, upcoming: 18, canceled: 2, completed: 10, fill_rate: 0.825 },
      participation: { requests: 140, approved: 100, no_show_rate: null },
      provinces: [
        { city_id: '00000000-0000-4000-8000-0000000000a1', name: 'Ankara', upcoming: 11 },
      ],
      provinces_active: 4,
      usage: { map_opened: 21 },
      daily: [],
    });
    await renderApp(<AdminGate />, { session });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Pilot' }));
    expect(await screen.findByText('Yaklaşan etkinliği olan il: 4')).toBeTruthy();
    expect(screen.getByText('%82,5')).toBeTruthy();
    expect(screen.getByText('Harita açıldı')).toBeTruthy();
    expect(screen.getByText('Kullanım (rıza veren 9 kişi)')).toBeTruthy();
    expect(mockApi.fetchPilotMetrics).toHaveBeenCalledWith(30);
    await fireEvent.press(screen.getByRole('radio', { name: '7 gün' }));
    await waitFor(() => expect(mockApi.fetchPilotMetrics).toHaveBeenCalledWith(7));
  });
});

describe('the copy', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  it('has the same keys in both languages', () => {
    expect(keys(enAdmin).sort()).toEqual(keys(trAdmin).sort());
  });
});
