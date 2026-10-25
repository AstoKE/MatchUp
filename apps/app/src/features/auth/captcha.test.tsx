import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { renderApp } from '@/test/render';
import { AuthFlowError } from './api/classify-auth-error';
import { setPendingEmail } from './pending-email';
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
import { SignInScreen } from './screens/SignInScreen';
import { SignUpScreen } from './screens/SignUpScreen';
import { VerifyEmailScreen } from './screens/VerifyEmailScreen';

// CAPTCHA ON: the app is configured with Cloudflare's always-pass TEST site key.
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual<typeof import('@/lib/env')>('@/lib/env');
  return { env: { ...actual.env, EXPO_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' } };
});

const mockApi = {
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
};
jest.mock('./api/auth-api', () => ({
  signInWithEmail: (...args: unknown[]) => mockApi.signInWithEmail(...args),
  signUpWithEmail: (...args: unknown[]) => mockApi.signUpWithEmail(...args),
  resendVerificationEmail: (...args: unknown[]) => mockApi.resendVerificationEmail(...args),
  requestPasswordReset: (...args: unknown[]) => mockApi.requestPasswordReset(...args),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{String(href)}</Text>,
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  setPendingEmail(null);
});

const REQUIRED = 'Devam etmek için güvenlik doğrulamasını tamamla.';

/** What the Turnstile page inside the WebView posts back (Captcha.native.tsx protocol). */
async function widgetSays(payload: unknown) {
  const webview = await screen.findByTestId('webview', { includeHiddenElements: true });
  await act(async () => {
    (webview.props as { onMessage: (e: unknown) => void }).onMessage({
      nativeEvent: { data: typeof payload === 'string' ? payload : JSON.stringify(payload) },
    });
  });
}

async function fillSignIn() {
  await fireEvent.changeText(screen.getByLabelText('E-posta'), 'ayse@example.com');
  await fireEvent.changeText(screen.getByLabelText('Şifre'), 'correct horse');
}
const pressSignIn = () => fireEvent.press(screen.getByRole('button', { name: 'Giriş yap' }));

describe('CAPTCHA (Turnstile) when configured', () => {
  it('shows the widget and blocks submission until it produced a token', async () => {
    await renderApp(<SignInScreen />);
    expect(screen.getByLabelText('Güvenlik doğrulaması')).toBeTruthy();
    await fillSignIn();
    await pressSignIn();
    expect(await screen.findByText(REQUIRED)).toBeTruthy();
    expect(mockApi.signInWithEmail).not.toHaveBeenCalled();
  });

  it('sends the token with the attempt and clears the hint once solved', async () => {
    mockApi.signInWithEmail.mockResolvedValue(undefined);
    await renderApp(<SignInScreen />);
    await fillSignIn();
    await pressSignIn();
    await screen.findByText(REQUIRED);
    await widgetSays({ token: 'tok-1' });
    expect(screen.queryByText(REQUIRED)).toBeNull();
    await pressSignIn();
    await waitFor(() => expect(mockApi.signInWithEmail).toHaveBeenCalledTimes(1));
    expect(mockApi.signInWithEmail.mock.calls[0]?.[0]).toEqual({
      email: 'ayse@example.com',
      password: 'correct horse',
      captchaToken: 'tok-1',
    });
  });

  it('never reuses a token: after a failed attempt a new challenge is required', async () => {
    mockApi.signInWithEmail.mockRejectedValueOnce(new AuthFlowError('CAPTCHA_FAILED'));
    await renderApp(<SignInScreen />);
    await fillSignIn();
    await widgetSays({ token: 'tok-1' });
    await pressSignIn();
    expect(await screen.findByText(/Güvenlik doğrulaması geçersiz/)).toBeTruthy();
    await pressSignIn();
    expect(await screen.findByText(REQUIRED)).toBeTruthy();
    expect(mockApi.signInWithEmail).toHaveBeenCalledTimes(1);
  });

  it('drops an expired token and ignores messages that are not the widget protocol', async () => {
    await renderApp(<SignInScreen />);
    await fillSignIn();
    await widgetSays({ token: 'tok-1' });
    await widgetSays({ expired: true });
    await widgetSays('not json');
    await widgetSays({ token: 42 });
    await pressSignIn();
    expect(await screen.findByText(REQUIRED)).toBeTruthy();
    expect(mockApi.signInWithEmail).not.toHaveBeenCalled();
  });

  it('explains a challenge that cannot load and lets the user retry', async () => {
    await renderApp(<SignInScreen />);
    await widgetSays({ error: true });
    expect(await screen.findByText(/Güvenlik doğrulaması yüklenemedi/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByTestId('webview', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps the challenge on its own origin and opens other links outside the app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderApp(<SignInScreen />);
    const webview = await screen.findByTestId('webview', { includeHiddenElements: true });
    const allow = (
      webview.props as { onShouldStartLoadWithRequest: (r: { url: string }) => boolean }
    ).onShouldStartLoadWithRequest;
    expect(allow({ url: 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x' })).toBe(
      true,
    );
    expect(allow({ url: 'http://localhost:8081/' })).toBe(true);
    expect(allow({ url: 'https://www.cloudflare.com/privacypolicy/' })).toBe(false);
    expect(open).toHaveBeenCalledWith('https://www.cloudflare.com/privacypolicy/');
    expect(allow({ url: 'javascript:alert(1)' })).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('protects sign-up', async () => {
    mockApi.signUpWithEmail.mockResolvedValue(undefined);
    await renderApp(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'yeni@example.com');
    await fireEvent.changeText(screen.getByLabelText('Şifre'), 'correct horse battery');
    await fireEvent.press(screen.getByRole('button', { name: 'Kayıt ol' }));
    expect(await screen.findByText(REQUIRED)).toBeTruthy();
    await widgetSays({ token: 'tok-signup' });
    await fireEvent.press(screen.getByRole('button', { name: 'Kayıt ol' }));
    await waitFor(() => expect(mockApi.signUpWithEmail).toHaveBeenCalledTimes(1));
    expect(mockApi.signUpWithEmail.mock.calls[0]?.[0]).toMatchObject({
      email: 'yeni@example.com',
      captchaToken: 'tok-signup',
    });
  });

  it('protects the password reset request', async () => {
    mockApi.requestPasswordReset.mockResolvedValue(undefined);
    await renderApp(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-posta'), 'yeni@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));
    expect(await screen.findByText(REQUIRED)).toBeTruthy();
    await widgetSays({ token: 'tok-reset' });
    await fireEvent.press(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));
    await waitFor(() =>
      expect(mockApi.requestPasswordReset.mock.calls[0]?.[0]).toEqual({
        email: 'yeni@example.com',
        captchaToken: 'tok-reset',
      }),
    );
  });

  it('protects the verification email resend', async () => {
    mockApi.resendVerificationEmail.mockResolvedValue(undefined);
    setPendingEmail('yeni@example.com');
    await renderApp(<VerifyEmailScreen />);
    await widgetSays({ token: 'tok-resend' });
    await fireEvent.press(screen.getByRole('button', { name: 'Bağlantıyı tekrar gönder' }));
    await waitFor(() =>
      expect(mockApi.resendVerificationEmail.mock.calls[0]?.[0]).toEqual({
        email: 'yeni@example.com',
        captchaToken: 'tok-resend',
      }),
    );
  });
});
