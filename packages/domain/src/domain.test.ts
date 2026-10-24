import { describe, expect, it } from 'vitest';
import {
  AppError,
  DOMAIN_ERROR_CODES,
  isDomainErrorCode,
  levelFromXp,
  isAuthValidationKey,
  mapRpcError,
  newPasswordSchema,
  resetRequestSchema,
  PASSWORD_MIN_LENGTH,
  signInSchema,
  signUpSchema,
  xpRequiredForLevel,
} from './index';

describe('level formula (RATING_SYSTEM §5.3)', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [299, 2],
    [300, 3],
    [599, 3],
    [600, 4],
    [999, 4],
    [1000, 5],
    [4499, 9],
    [4500, 10],
  ])('xp %i → level %i', (xp, level) => {
    expect(levelFromXp(xp)).toBe(level);
  });

  it('is the inverse of xpRequiredForLevel at every threshold', () => {
    for (let level = 1; level <= 200; level += 1) {
      const required = xpRequiredForLevel(level);
      expect(levelFromXp(required)).toBe(level);
      if (required > 0) expect(levelFromXp(required - 1)).toBe(level - 1);
    }
  });

  it('is monotonic non-decreasing', () => {
    let previous = 1;
    for (let xp = 0; xp <= 20000; xp += 7) {
      const level = levelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('rejects invalid input', () => {
    expect(() => levelFromXp(-1)).toThrow(RangeError);
    expect(() => levelFromXp(Number.NaN)).toThrow(RangeError);
    expect(() => xpRequiredForLevel(0)).toThrow(RangeError);
  });
});

describe('error mapping', () => {
  it('maps stable domain codes raised by RPCs (P0001)', () => {
    const error = mapRpcError({ code: 'P0001', message: 'EVENT_FULL' });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('EVENT_FULL');
  });
  it('maps insufficient_privilege to NOT_ALLOWED', () => {
    expect(mapRpcError({ code: '42501', message: 'permission denied for table x' }).code).toBe(
      'NOT_ALLOWED',
    );
  });
  it('never leaks raw database text for unknown errors', () => {
    const error = mapRpcError({ code: '23505', message: 'duplicate key value violates ...' });
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('UNKNOWN');
  });
  it('does not trust arbitrary P0001 messages', () => {
    expect(mapRpcError({ code: 'P0001', message: 'something else' }).code).toBe('UNKNOWN');
  });
  it('every declared code round-trips through the type guard', () => {
    for (const code of DOMAIN_ERROR_CODES) expect(isDomainErrorCode(code)).toBe(true);
    expect(isDomainErrorCode('nope')).toBe(false);
  });
});

describe('auth schemas', () => {
  const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
    result.error?.issues.map((i) => i.message) ?? [];

  it('normalizes email and enforces password policy on sign-up', () => {
    const ok = signUpSchema.parse({ email: '  Ayse@Example.COM ', password: 'x'.repeat(10) });
    expect(ok.email).toBe('ayse@example.com');
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });

  it('reports stable, localizable message keys (never prose)', () => {
    const bad = signUpSchema.safeParse({ email: 'nope', password: 'short' });
    expect(bad.success).toBe(false);
    const keys = messages(bad);
    expect(keys).toEqual(expect.arrayContaining(['EMAIL_INVALID', 'PASSWORD_TOO_SHORT']));
    for (const key of keys) expect(isAuthValidationKey(key)).toBe(true);
  });

  it('rejects overlong passwords (bcrypt 72-byte limit) and overlong emails', () => {
    expect(
      messages(signUpSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(73) })),
    ).toContain('PASSWORD_TOO_LONG');
    expect(
      messages(
        signUpSchema.safeParse({ email: 'a'.repeat(250) + '@b.co', password: 'x'.repeat(10) }),
      ),
    ).toContain('EMAIL_INVALID');
  });

  it('does not reveal the password policy on sign-in', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(messages(signInSchema.safeParse({ email: 'a@b.co', password: '' }))).toEqual([
      'PASSWORD_REQUIRED',
    ]);
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  it('reset and new-password schemas reuse the same rules', () => {
    expect(resetRequestSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(messages(resetRequestSchema.safeParse({ email: '' }))).toContain('EMAIL_INVALID');
    expect(messages(newPasswordSchema.safeParse({ password: 'short' }))).toContain(
      'PASSWORD_TOO_SHORT',
    );
  });
});
