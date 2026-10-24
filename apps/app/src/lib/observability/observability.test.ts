import { configureLogger, log, type LogEntry } from './logger';
import { REDACTED, redactString, redactValue } from './redact';
import { scrubBreadcrumb, scrubEvent } from './sentry';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXBsYWNlaG9sZGVy';

describe('redactString', () => {
  it('removes emails, bearer tokens, JWTs, Supabase keys and token query params', () => {
    const text = `user ayse@example.com sent Bearer abc.def-ghi with ${JWT} and sb_secret_abcdef123456 at /cb?code=12345&x=1&access_token=zzz`;
    const out = redactString(text);
    expect(out).not.toContain('ayse@example.com');
    expect(out).not.toContain('abc.def-ghi');
    expect(out).not.toContain('eyJ');
    expect(out).not.toContain('sb_secret_abcdef');
    expect(out).not.toContain('12345');
    expect(out).not.toContain('zzz');
    expect(out).toContain('x=1'); // unrelated parameters survive
  });

  it('leaves ordinary text alone', () => {
    expect(redactString('Event 42 canceled by organizer')).toBe('Event 42 canceled by organizer');
  });
});

describe('redactValue', () => {
  it.each([
    'password',
    'newPassword',
    'access_token',
    'refreshToken',
    'Authorization',
    'apikey',
    'email',
    'phone',
    'latitude',
    'lat',
    'lng',
    'bio',
    'display_name',
    'message',
    'cookie',
    'sessionId',
  ])('replaces the value of a sensitive key "%s"', (key) => {
    expect(redactValue({ [key]: 'something-private' })).toEqual({ [key]: REDACTED });
  });

  it('keeps harmless diagnostics', () => {
    expect(redactValue({ eventId: 'abc', status: 429, retryable: true })).toEqual({
      eventId: 'abc',
      status: 429,
      retryable: true,
    });
  });

  it('works through nesting and arrays, and redacts patterns inside values', () => {
    const out = redactValue({
      request: { headers: { Authorization: `Bearer ${JWT}` }, url: 'https://x.test/?token=abc' },
      list: [{ note: 'contact a@b.co' }],
    }) as {
      request: { headers: { Authorization: string }; url: string };
      list: { note: string }[];
    };
    expect(out.request.headers.Authorization).toBe(REDACTED);
    expect(out.request.url).toBe('https://x.test/?token=[redacted]');
    expect(out.list[0]?.note).toBe(REDACTED); // key "note" is treated as free text
  });

  it('survives circular references and deep structures', () => {
    const loop: Record<string, unknown> = { name: 'x' };
    loop.self = loop;
    expect(redactValue(loop)).toEqual({ name: 'x', self: '[circular]' });
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 20; i += 1) deep = (deep.next = {}) as Record<string, unknown>;
    expect(JSON.stringify(redactValue(root))).toContain('[depth-limit]');
  });

  it('caps very large arrays', () => {
    expect((redactValue(Array.from({ length: 500 }, (_, i) => i)) as number[]).length).toBe(50);
  });

  it('serializes errors without stack traces and with redacted messages', () => {
    const error = Object.assign(new Error('failed for ayse@example.com'), { code: 'P0001' });
    expect(redactValue(error)).toEqual({
      name: 'Error',
      message: 'failed for [email]',
      code: 'P0001',
    });
  });
});

describe('logger', () => {
  const entries: LogEntry[] = [];
  beforeEach(() => {
    entries.length = 0;
    configureLogger({ minLevel: 'debug', sink: (entry) => entries.push(entry) });
  });
  afterAll(() => configureLogger({ minLevel: 'warn' }));

  it('emits structured entries with stable codes', () => {
    log.info('auth', 'SIGN_IN_OK', { provider: 'password' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'info',
      module: 'auth',
      code: 'SIGN_IN_OK',
      fields: { provider: 'password' },
    });
    expect(Date.parse(entries[0]?.time ?? '')).not.toBeNaN();
  });

  it('redacts secrets and personal data in fields AND errors, whatever the caller does', () => {
    log.error('auth', 'SIGN_IN_FAILED', new Error(`bad token ${JWT}`), {
      email: 'ayse@example.com',
      password: 'hunter2',
      attempt: 2,
    });
    const text = JSON.stringify(entries[0]);
    expect(text).not.toContain('ayse@example.com');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('eyJ');
    expect(entries[0]?.fields).toEqual({ email: REDACTED, password: REDACTED, attempt: 2 });
  });

  it('respects the minimum level (release builds keep warn+error only)', () => {
    configureLogger({ minLevel: 'warn', sink: (entry) => entries.push(entry) });
    log.debug('x', 'D');
    log.info('x', 'I');
    log.warn('x', 'W');
    log.error('x', 'E');
    expect(entries.map((e) => e.code)).toEqual(['W', 'E']);
  });
});

describe('Sentry scrubbing (runs before anything leaves the device)', () => {
  it('drops identity, IP-like server info, cookies, headers, bodies and query strings', () => {
    const scrubbed = scrubEvent({
      message: 'failed for ayse@example.com',
      user: { id: 'u1', email: 'ayse@example.com', ip_address: '1.2.3.4' },
      server_name: 'laptop-of-ayse',
      request: {
        url: 'https://app.test/auth/callback?code=SECRETCODE',
        method: 'GET',
        headers: { Authorization: `Bearer ${JWT}`, cookie: 'a=b' },
        data: { password: 'x' },
        query_string: 'code=SECRETCODE',
      },
      exception: { values: [{ type: 'Error', value: `boom ${JWT}` }] },
      extra: { email: 'ayse@example.com', attempt: 3 },
      tags: { module: 'auth' },
    });
    const text = JSON.stringify(scrubbed);
    expect(scrubbed).not.toHaveProperty('user');
    expect(scrubbed).not.toHaveProperty('server_name');
    for (const secret of ['ayse@example.com', 'SECRETCODE', 'eyJ', '1.2.3.4', 'cookie', 'hunter']) {
      expect(text).not.toContain(secret);
    }
    expect(scrubbed.request).toEqual({ url: 'https://app.test/auth/callback', method: 'GET' });
    expect(scrubbed.extra).toEqual({ email: REDACTED, attempt: 3 });
    expect(scrubbed.tags).toEqual({ module: 'auth' });
  });

  it('scrubs breadcrumbs', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'fetch',
      message: 'GET /x?token=abc',
      data: { url: 'https://x.test/?apikey=k', email: 'a@b.co' },
    });
    expect(JSON.stringify(scrubbed)).not.toMatch(/abc|a@b\.co|apikey=k/);
  });
});
