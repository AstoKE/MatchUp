import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { SessionState } from '@/features/auth';
import { AuthFlowError } from '@/features/auth/api/classify-auth-error';
import { RequireOnboarded } from '@/features/onboarding';
import { renderApp } from '@/test/render';
import { AccountSection } from './components/AccountSection';
import { exportFileName } from './hooks';
import { DeleteAccountScreen } from './screens/DeleteAccountScreen';
import { PendingDeletionScreen } from './screens/PendingDeletionScreen';

const mockApi = {
  requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
  exportMyData: jest.fn(),
  saveExport: jest.fn(),
  signInWithEmail: jest.fn(),
  signOut: jest.fn(),
  fetchMyAccount: jest.fn(),
};
jest.mock('./api/account-api', () => ({
  requestAccountDeletion: (...a: unknown[]) => mockApi.requestAccountDeletion(...a),
  cancelAccountDeletion: (...a: unknown[]) => mockApi.cancelAccountDeletion(...a),
  exportMyData: (...a: unknown[]) => mockApi.exportMyData(...a),
}));
jest.mock('./save-export', () => ({
  saveExport: (...a: unknown[]) => mockApi.saveExport(...a),
}));
jest.mock('@/features/auth/api/auth-api', () => ({
  signInWithEmail: (...a: unknown[]) => mockApi.signInWithEmail(...a),
  signOut: (...a: unknown[]) => mockApi.signOut(...a),
}));
jest.mock('@/features/onboarding/api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockApi.fetchMyAccount(...a),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  acceptCurrentLegalTerms: jest.fn(),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/settings',
    Redirect: ({ href }: { href: unknown }) => (
      <RNText testID="redirect">{JSON.stringify(href)}</RNText>
    ),
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const signedIn: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'ayse@example.com',
  emailVerified: true,
};
const account = (overrides: Record<string, unknown> = {}) => ({
  userId: signedIn.status === 'authenticated' ? signedIn.userId : '',
  status: 'ACTIVE',
  emailVerified: true,
  adultConfirmed: true,
  onboarded: true,
  legalConsentCurrent: true,
  deletionDueAt: null,
  ...overrides,
});
const pending = () =>
  account({ status: 'PENDING_DELETION', deletionDueAt: '2026-11-24T10:00:00.000Z' });

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchMyAccount.mockResolvedValue(account());
});

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

describe('AccountSection (Settings › Account)', () => {
  it('downloads the export as a dated JSON file and confirms it', async () => {
    mockApi.exportMyData.mockResolvedValue({ format: 'account-export', account: { user_id: 'u' } });
    mockApi.saveExport.mockResolvedValue(undefined);
    await renderApp(<AccountSection />, { session: signedIn });
    await press('Verilerimi indir');
    await waitFor(() => expect(mockApi.saveExport).toHaveBeenCalledTimes(1));
    const [fileName, json] = mockApi.saveExport.mock.calls[0] as [string, string];
    expect(fileName).toBe(exportFileName());
    expect(fileName).toMatch(/^[a-z0-9-]+-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json)).toEqual({ format: 'account-export', account: { user_id: 'u' } });
    expect(await screen.findByText('Verilerin hazır.')).toBeTruthy();
  });

  it('explains the once-a-day limit instead of a generic error', async () => {
    mockApi.exportMyData.mockRejectedValue(new AppError('RATE_LIMITED'));
    await renderApp(<AccountSection />, { session: signedIn });
    await press('Verilerimi indir');
    expect(await screen.findByText(/son 24 saat içinde zaten indirdin/)).toBeTruthy();
    expect(mockApi.saveExport).not.toHaveBeenCalled();
  });

  it('leads to the deletion screen instead of deleting directly', async () => {
    await renderApp(<AccountSection />, { session: signedIn });
    await press('Hesabımı sil');
    expect(mockRouter.push).toHaveBeenCalledWith('/delete-account');
    expect(mockApi.requestAccountDeletion).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountScreen', () => {
  const CONFIRM = 'Hesabımı silmeyi talep et';

  it('explains the 30-day grace period and what is permanent', async () => {
    await renderApp(<DeleteAccountScreen />, { session: signedIn });
    expect(await screen.findByText(/30 gün beklemede kalır/)).toBeTruthy();
    expect(screen.getByText(/kalıcı olarak silinir/)).toBeTruthy();
  });

  it('requires the password before anything is sent', async () => {
    await renderApp(<DeleteAccountScreen />, { session: signedIn });
    await screen.findByText('Hesabını sil');
    await press(CONFIRM);
    expect(await screen.findByText('Şifreni gir.')).toBeTruthy();
    expect(mockApi.signInWithEmail).not.toHaveBeenCalled();
    expect(mockApi.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('re-authenticates with the password, then requests deletion and shows the pending screen', async () => {
    mockApi.signInWithEmail.mockResolvedValue(undefined);
    mockApi.requestAccountDeletion.mockResolvedValue('2026-11-24T10:00:00.000Z');
    await renderApp(<DeleteAccountScreen />, { session: signedIn });
    await fireEvent.changeText(await screen.findByLabelText('Şifren'), 'correct horse');
    await press(CONFIRM);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/account-deletion'));
    expect(mockApi.signInWithEmail.mock.calls[0]?.[0]).toMatchObject({
      email: 'ayse@example.com',
      password: 'correct horse',
    });
    expect(mockApi.signInWithEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mockApi.requestAccountDeletion.mock.invocationCallOrder[0]!,
    );
  });

  it('deletes the profile photo after the password check and before the request, and goes on if that fails', async () => {
    mockApi.signInWithEmail.mockResolvedValue(undefined);
    mockApi.requestAccountDeletion.mockResolvedValue('2026-11-24T10:00:00.000Z');
    const beforeRequest = jest.fn(() => Promise.reject(new Error('storage down')));
    await renderApp(<DeleteAccountScreen beforeRequest={beforeRequest} />, { session: signedIn });
    expect(await screen.findByText(/Profil fotoğrafın varsa/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Şifren'), 'correct horse');
    await press(CONFIRM);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/account-deletion'));
    expect(beforeRequest).toHaveBeenCalledWith(
      signedIn.status === 'authenticated' ? signedIn.userId : '',
    );
    expect(mockApi.signInWithEmail.mock.invocationCallOrder[0]).toBeLessThan(
      beforeRequest.mock.invocationCallOrder[0]!,
    );
    expect(beforeRequest.mock.invocationCallOrder[0]).toBeLessThan(
      mockApi.requestAccountDeletion.mock.invocationCallOrder[0]!,
    );
  });

  it('stops at a wrong password with the generic credentials message', async () => {
    mockApi.signInWithEmail.mockRejectedValue(new AuthFlowError('INVALID_CREDENTIALS'));
    await renderApp(<DeleteAccountScreen />, { session: signedIn });
    await fireEvent.changeText(await screen.findByLabelText('Şifren'), 'wrong');
    await press(CONFIRM);
    expect(await screen.findByText('E-posta veya şifre hatalı.')).toBeTruthy();
    expect(mockApi.requestAccountDeletion).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('shows the server refusal (e.g. re-authentication too old) in plain language', async () => {
    mockApi.signInWithEmail.mockResolvedValue(undefined);
    mockApi.requestAccountDeletion.mockRejectedValue(new AppError('REAUTH_REQUIRED'));
    await renderApp(<DeleteAccountScreen />, { session: signedIn });
    await fireEvent.changeText(await screen.findByLabelText('Şifren'), 'correct horse');
    await press(CONFIRM);
    expect(await screen.findByText(/şifreni yeniden girmelisin/)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('PendingDeletionScreen', () => {
  it('shows the purge date in the user’s language and can cancel', async () => {
    mockApi.fetchMyAccount.mockResolvedValue(pending());
    mockApi.cancelAccountDeletion.mockResolvedValue(undefined);
    await renderApp(<PendingDeletionScreen />, { session: signedIn });
    expect(await screen.findByText(/24 Kasım 2026 tarihinde kalıcı olarak silinecek/)).toBeTruthy();
    await press('Silme talebini iptal et');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/profile'));
    expect(mockApi.cancelAccountDeletion).toHaveBeenCalledTimes(1);
  });

  it('lets the user sign out instead', async () => {
    mockApi.fetchMyAccount.mockResolvedValue(pending());
    mockApi.signOut.mockResolvedValue(undefined);
    await renderApp(<PendingDeletionScreen />, { session: signedIn });
    await screen.findByText('Hesabın silinecek');
    await press('Çıkış yap');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockApi.cancelAccountDeletion).not.toHaveBeenCalled();
  });

  it('is not reachable for an account that is not pending', async () => {
    await renderApp(<PendingDeletionScreen />, { session: signedIn });
    expect(await screen.findByTestId('redirect')).toHaveTextContent('"/"');
  });

  it('works in English too', async () => {
    mockApi.fetchMyAccount.mockResolvedValue(pending());
    await renderApp(<PendingDeletionScreen />, { session: signedIn, locale: 'en' });
    expect(await screen.findByText(/deleted permanently on November 24, 2026/)).toBeTruthy();
  });
});

describe('RequireOnboarded with a pending deletion', () => {
  it('sends the user to the pending-deletion screen before anything else', async () => {
    mockApi.fetchMyAccount.mockResolvedValue(pending());
    await renderApp(
      <RequireOnboarded>
        <Text>gizli içerik</Text>
      </RequireOnboarded>,
      { session: signedIn },
    );
    expect(await screen.findByTestId('redirect')).toHaveTextContent(/\/account-deletion/);
    expect(screen.queryByText('gizli içerik')).toBeNull();
  });
});
