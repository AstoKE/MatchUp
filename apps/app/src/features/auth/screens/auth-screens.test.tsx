import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderApp } from '@/test/render';
import { AuthFlowError } from '../api/classify-auth-error';
import { getPendingEmail, setPendingEmail } from '../pending-email';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { SignInScreen } from './SignInScreen';
import { SignUpScreen } from './SignUpScreen';
import { VerifyEmailScreen } from './VerifyEmailScreen';

const mockApi = {
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
};
jest.mock('../api/auth-api', () => ({
  signInWithEmail: (...args: unknown[]) => mockApi.signInWithEmail(...args),
  signUpWithEmail: (...args: unknown[]) => mockApi.signUpWithEmail(...args),
  resendVerificationEmail: (...args: unknown[]) => mockApi.resendVerificationEmail(...args),
  requestPasswordReset: (...args: unknown[]) => mockApi.requestPasswordReset(...args),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{String(href)}</Text>,
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  setPendingEmail(null);
});

const typeInto = async (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

describe('SignInScreen', () => {
  it('shows localized validation errors and does not call the API for invalid input', async () => {
    await renderApp(<SignInScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(await screen.findByText('Geçerli bir e-posta adresi gir.')).toBeTruthy();
    expect(screen.getByText('Şifreni gir.')).toBeTruthy();
    expect(mockApi.signInWithEmail).not.toHaveBeenCalled();
  });

  it('submits normalized credentials and navigates to the sanitized return path', async () => {
    mockApi.signInWithEmail.mockResolvedValue(undefined);
    mockParams = { returnTo: '/my-events' };
    await renderApp(<SignInScreen />);
    await typeInto('E-posta', '  Ayse@Example.COM ');
    await typeInto('Şifre', 'correct horse');
    await fireEvent.press(screen.getByRole('button', { name: 'Giriş yap' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/my-events'));
    expect(mockApi.signInWithEmail.mock.calls[0]?.[0]).toEqual({
      email: 'ayse@example.com',
      password: 'correct horse',
    });
  });

  it('never follows a malicious returnTo (open redirect)', async () => {
    mockApi.signInWithEmail.mockResolvedValue(undefined);
    mockParams = { returnTo: 'https://evil.example/phish' };
    await renderApp(<SignInScreen />);
    await typeInto('E-posta', 'a@b.co');
    await typeInto('Şifre', 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Giriş yap' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('shows one generic message for wrong credentials (no account enumeration)', async () => {
    mockApi.signInWithEmail.mockRejectedValue(new AuthFlowError('INVALID_CREDENTIALS'));
    await renderApp(<SignInScreen />);
    await typeInto('E-posta', 'a@b.co');
    await typeInto('Şifre', 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya şifre hatalı.');
  });

  it.each([
    ['RATE_LIMITED', 'Çok fazla deneme yaptın. Lütfen biraz sonra tekrar dene.'],
    ['NETWORK', 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.'],
    ['UNKNOWN', 'Bir şeyler ters gitti. Lütfen tekrar dene.'],
  ] as const)('maps %s to a localized message', async (failure, message) => {
    mockApi.signInWithEmail.mockRejectedValue(new AuthFlowError(failure));
    await renderApp(<SignInScreen />);
    await typeInto('E-posta', 'a@b.co');
    await typeInto('Şifre', 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('renders in English when the app language is English', async () => {
    await renderApp(<SignInScreen />, { locale: 'en' });
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('redirects signed-in users away from the form', async () => {
    mockParams = { returnTo: '/profile' };
    await renderApp(<SignInScreen />, {
      session: { status: 'authenticated', userId: 'u', email: 'a@b.co', emailVerified: true },
    });
    expect(screen.getByTestId('redirect')).toHaveTextContent('/profile');
  });

  it('hides the password by default and offers an accessible reveal toggle', async () => {
    await renderApp(<SignInScreen />);
    const input = screen.getByLabelText('Şifre');
    expect(input.props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Şifreyi göster' }));
    expect(screen.getByLabelText('Şifre').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Şifreyi gizle' })).toBeTruthy();
  });
});

describe('SignUpScreen', () => {
  it('enforces the password policy client-side (server enforces it again)', async () => {
    await renderApp(<SignUpScreen />);
    await typeInto('E-posta', 'a@b.co');
    await typeInto('Şifre', 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Kayıt ol' }));
    expect(await screen.findByText('Şifre en az 10 karakter olmalı.')).toBeTruthy();
    expect(mockApi.signUpWithEmail).not.toHaveBeenCalled();
  });

  it('always continues to "check your email" after a successful request', async () => {
    mockApi.signUpWithEmail.mockResolvedValue(undefined);
    await renderApp(<SignUpScreen />);
    await typeInto('E-posta', 'Yeni@Example.com');
    await typeInto('Şifre', 'a-long-enough-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Kayıt ol' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/verify-email'));
    expect(getPendingEmail()).toBe('yeni@example.com');
  });

  it('keeps the user on the form and explains transport failures', async () => {
    mockApi.signUpWithEmail.mockRejectedValue(new AuthFlowError('NETWORK'));
    await renderApp(<SignUpScreen />);
    await typeInto('E-posta', 'a@b.co');
    await typeInto('Şifre', 'a-long-enough-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Kayıt ol' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Bağlantı kurulamadı/);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('VerifyEmailScreen', () => {
  it('shows the pending address (memory only) and resends to it', async () => {
    setPendingEmail('yeni@example.com');
    mockApi.resendVerificationEmail.mockResolvedValue(undefined);
    await renderApp(<VerifyEmailScreen />);
    expect(screen.getByText(/yeni@example.com adresine bir doğrulama bağlantısı/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Bağlantıyı tekrar gönder' }));
    await waitFor(() => expect(mockApi.resendVerificationEmail).toHaveBeenCalled());
    expect(mockApi.resendVerificationEmail.mock.calls[0]?.[0]).toEqual({
      email: 'yeni@example.com',
    });
    expect(await screen.findByText('Bağlantı tekrar gönderildi.')).toBeTruthy();
  });

  it('after a reload (no pending address) asks for the address instead of guessing', async () => {
    await renderApp(<VerifyEmailScreen />);
    expect(screen.getByLabelText('Bağlantının gönderileceği e-posta')).toBeTruthy();
    expect(screen.getByText(/spam/)).toBeTruthy();
  });
});

describe('ForgotPasswordScreen', () => {
  it('shows the same neutral confirmation regardless of whether the account exists', async () => {
    mockApi.requestPasswordReset.mockResolvedValue(undefined);
    await renderApp(<ForgotPasswordScreen />);
    await typeInto('E-posta', 'nobody@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));
    expect(await screen.findByText(/şifre sıfırlama bağlantısı gönderildi/)).toBeTruthy();
  });

  it('rejects an invalid address locally', async () => {
    await renderApp(<ForgotPasswordScreen />);
    await typeInto('E-posta', 'nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));
    expect(await screen.findByText('Geçerli bir e-posta adresi gir.')).toBeTruthy();
    expect(mockApi.requestPasswordReset).not.toHaveBeenCalled();
  });
});
