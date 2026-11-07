import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { SessionState } from '@/features/auth';
import { AuthFlowError } from '@/features/auth/api/classify-auth-error';
import { renderApp } from '@/test/render';
import { RequireOnboarded } from './RequireOnboarded';
import { VerifyPhoneScreen } from './screens/VerifyPhoneScreen';

const ME = '00000000-0000-4000-8000-0000000000aa';
const mockAuth = { requestPhoneCode: jest.fn(), verifyPhoneCode: jest.fn() };
jest.mock('@/features/auth/api/auth-api', () => ({
  ...jest.requireActual<object>('@/features/auth/api/auth-api'),
  requestPhoneCode: (...a: unknown[]) => mockAuth.requestPhoneCode(...a),
  verifyPhoneCode: (...a: unknown[]) => mockAuth.verifyPhoneCode(...a),
}));
const mockAccount = jest.fn();
jest.mock('./api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockAccount(...a),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  saveGenderAndAvatar: jest.fn(),
  acceptCurrentLegalTerms: jest.fn(),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/create',
    Redirect: ({ href }: { href: unknown }) => (
      <RNText testID="redirect">{JSON.stringify(href)}</RNText>
    ),
  };
});

const signedIn: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'a@example.com',
  emailVerified: true,
};
const account = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  status: 'ACTIVE',
  emailVerified: true,
  isAdmin: false,
  adultConfirmed: true,
  onboarded: true,
  legalConsentCurrent: true,
  deletionDueAt: null,
  phoneVerified: false,
  phoneRequired: false,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockAuth.requestPhoneCode.mockResolvedValue(undefined);
  mockAuth.verifyPhoneCode.mockResolvedValue(undefined);
  mockAccount.mockResolvedValue(account());
});

describe('the gate', () => {
  const gated = () => (
    <RequireOnboarded>
      <Text>gizli içerik</Text>
    </RequireOnboarded>
  );

  it('sends a person without a verified phone to verify it, when the server requires one', async () => {
    mockAccount.mockResolvedValue(account({ phoneRequired: true }));
    await renderApp(gated(), { session: signedIn });
    const redirect = await screen.findByTestId('redirect');
    expect(redirect).toHaveTextContent(/verify-phone/);
    expect(redirect).toHaveTextContent(/\/create/);
    expect(screen.queryByText('gizli içerik')).toBeNull();
  });

  it('lets everyone through while it is not required, and a verified phone always', async () => {
    await renderApp(gated(), { session: signedIn });
    expect(await screen.findByText('gizli içerik')).toBeTruthy();
  });

  it('lets a verified phone through when required', async () => {
    mockAccount.mockResolvedValue(account({ phoneRequired: true, phoneVerified: true }));
    await renderApp(gated(), { session: signedIn });
    expect(await screen.findByText('gizli içerik')).toBeTruthy();
  });
});

describe('VerifyPhoneScreen', () => {
  const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

  it('accepts a Turkish mobile number only, then texts a code to it', async () => {
    await renderApp(<VerifyPhoneScreen />, { session: signedIn });
    await fireEvent.changeText(await screen.findByLabelText('Cep telefonu'), '0312 123 45 67');
    await press('Kod gönder');
    expect(screen.getByText(/Geçerli bir Türkiye cep numarası gir/)).toBeTruthy();
    expect(mockAuth.requestPhoneCode).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Cep telefonu'), '0532 123 45 67');
    await press('Kod gönder');
    await waitFor(() => expect(mockAuth.requestPhoneCode).toHaveBeenCalledWith('+905321234567'));
    expect(await screen.findByText(/\+90 532 \*\*\* \*\* 67 numarasına/)).toBeTruthy();
    // A new code only after the countdown.
    expect(screen.getByRole('button', { name: /Yeni kod \d+ sn sonra/ })).toBeDisabled();
  });

  it('confirms the code, then goes back to where the person was', async () => {
    mockParams = { returnTo: '/create' };
    await renderApp(<VerifyPhoneScreen />, { session: signedIn });
    await fireEvent.changeText(await screen.findByLabelText('Cep telefonu'), '532 123 4567');
    await press('Kod gönder');
    const code = await screen.findByLabelText('Doğrulama kodu');
    await fireEvent.changeText(code, '12a');
    await press('Doğrula');
    expect(screen.getByText('6 haneli kodu gir.')).toBeTruthy();
    await fireEvent.changeText(code, '123456');
    await press('Doğrula');
    await waitFor(() =>
      expect(mockAuth.verifyPhoneCode).toHaveBeenCalledWith('+905321234567', '123456'),
    );
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/create'));
  });

  it('says plainly when the number is on another account or the code is wrong', async () => {
    mockAuth.requestPhoneCode.mockRejectedValueOnce(new AuthFlowError('PHONE_TAKEN'));
    await renderApp(<VerifyPhoneScreen />, { session: signedIn });
    await fireEvent.changeText(await screen.findByLabelText('Cep telefonu'), '5321234567');
    await press('Kod gönder');
    expect(await screen.findByText(/Bu numara başka bir hesapta kayıtlı/)).toBeTruthy();

    await press('Kod gönder');
    mockAuth.verifyPhoneCode.mockRejectedValueOnce(new AuthFlowError('CODE_INVALID'));
    await fireEvent.changeText(await screen.findByLabelText('Doğrulama kodu'), '000000');
    await press('Doğrula');
    expect(await screen.findByText(/Kod hatalı ya da süresi dolmuş/)).toBeTruthy();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});
