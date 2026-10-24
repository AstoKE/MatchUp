import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n } from '@/lib/i18n';
import { ThemeProvider } from '@/ui';
import { RequireAuth } from './RequireAuth';
import { sanitizeReturnTo } from './returnTo';
import { SessionContext, type SessionState } from './session';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: unknown) => {
    mockRedirect(props);
    return null;
  },
  usePathname: () => '/my-events',
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderGuarded(session: SessionState) {
  initI18n('tr');
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <SessionContext.Provider value={session}>
          <RequireAuth>
            <Text>gizli içerik</Text>
          </RequireAuth>
        </SessionContext.Provider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => mockRedirect.mockClear());

describe('RequireAuth (UX guard; the database enforces the real rules)', () => {
  it('sends guests to sign-in and remembers where they were', async () => {
    await renderGuarded({ status: 'guest' });
    expect(screen.queryByText('gizli içerik')).toBeNull();
    expect(mockRedirect).toHaveBeenCalledWith({
      href: { pathname: '/sign-in', params: { returnTo: '/my-events' } },
    });
  });

  it('shows a loading indicator (and does not redirect) while the session loads', async () => {
    await renderGuarded({ status: 'loading' });
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.queryByText('gizli içerik')).toBeNull();
  });

  it('renders content for authenticated users', async () => {
    await renderGuarded({
      status: 'authenticated',
      userId: 'u1',
      email: 'a@b.co',
      emailVerified: true,
    });
    expect(screen.getByText('gizli içerik')).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe('sanitizeReturnTo (no open redirects)', () => {
  it.each([
    ['/', '/'],
    ['/e/123', '/e/123'],
    ['/my-events?tab=past', '/my-events?tab=past'],
    [undefined, '/'],
    [null, '/'],
    ['', '/'],
    ['//evil.example', '/'],
    [`/${String.fromCharCode(92)}evil.example`, '/'],
    ['https://evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['evil.example', '/'],
    ['/ok\u0000bad', '/'],
    ['/ok\nbad', '/'],
    ['/sign-in', '/'],
    ['/sign-in?returnTo=/x', '/'],
    ['/sign-up', '/'],
    ['/reset-password', '/'],
    [`/${'a'.repeat(600)}`, '/'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeReturnTo(input as string | undefined)).toBe(expected);
  });

  it('uses the first value when the param is repeated', () => {
    expect(sanitizeReturnTo(['/e/1', '//evil'])).toBe('/e/1');
    expect(sanitizeReturnTo(['//evil', '/e/1'])).toBe('/');
  });
});
