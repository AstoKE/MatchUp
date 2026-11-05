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
};
jest.mock('./api/admin-api', () => ({
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
}));
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
    expect(await screen.findByRole('button', { name: /Kişi · Deniz Kaya/ })).toBeTruthy();
    expect(mockApi.fetchReports).toHaveBeenCalledWith('OPEN', null);
  });

  it('dismisses a report in three taps: open it, dismiss, confirm', async () => {
    await renderApp(<AdminGate />, { session });
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
    expect(await screen.findByText('Açık bildirim yok.')).toBeTruthy();
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
