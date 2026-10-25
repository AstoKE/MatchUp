import { EnvError, parseEnv } from './env.schema';

const valid = {
  EXPO_PUBLIC_APP_ENV: 'development',
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_0123456789abcdef0123',
};

function jwt(payload: object): string {
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.signature-placeholder`;
}

describe('parseEnv', () => {
  it('accepts a valid public configuration and applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.EXPO_PUBLIC_WEB_URL).toBe('http://localhost:8081');
    expect(env.EXPO_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it('treats an empty Sentry DSN as disabled', () => {
    expect(
      parseEnv({ ...valid, EXPO_PUBLIC_SENTRY_DSN: '' }).EXPO_PUBLIC_SENTRY_DSN,
    ).toBeUndefined();
  });

  it('treats an empty or missing Turnstile site key as CAPTCHA off, and accepts a real-shaped one', () => {
    expect(parseEnv(valid).EXPO_PUBLIC_TURNSTILE_SITE_KEY).toBeUndefined();
    expect(
      parseEnv({ ...valid, EXPO_PUBLIC_TURNSTILE_SITE_KEY: '' }).EXPO_PUBLIC_TURNSTILE_SITE_KEY,
    ).toBeUndefined();
    expect(
      parseEnv({ ...valid, EXPO_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' })
        .EXPO_PUBLIC_TURNSTILE_SITE_KEY,
    ).toBe('1x00000000000000000000AA');
  });

  it('rejects a Turnstile value that cannot be a site key (e.g. a pasted URL or secret with spaces)', () => {
    expect(() =>
      parseEnv({ ...valid, EXPO_PUBLIC_TURNSTILE_SITE_KEY: 'https://example.com/key' }),
    ).toThrow(/EXPO_PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it('fails fast and names the missing variables without echoing values', () => {
    let error: unknown;
    try {
      parseEnv({ EXPO_PUBLIC_APP_ENV: 'development' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const issues = (error as EnvError).issues.join('\n');
    expect(issues).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(issues).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('rejects an unknown environment name', () => {
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_APP_ENV: 'prod' })).toThrow(EnvError);
  });

  it('REJECTS a service_role JWT so it can never be bundled in a client', () => {
    const serviceKey = jwt({ role: 'service_role', iss: 'supabase-demo' });
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_ANON_KEY: serviceKey })).toThrow(
      /service_role/,
    );
  });

  it('REJECTS Supabase secret keys', () => {
    expect(() =>
      parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_0123456789abcdefghij' }),
    ).toThrow(/SECRET/);
  });

  it('accepts an anon-role JWT', () => {
    const anonKey = jwt({ role: 'anon', iss: 'supabase-demo' });
    expect(parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey }).EXPO_PUBLIC_APP_ENV).toBe(
      'development',
    );
  });
});
