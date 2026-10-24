import { describe, expect, it } from 'vitest';
import {
  AppError,
  DOMAIN_ERROR_CODES,
  isDomainErrorCode,
  levelFromXp,
  mapRpcError,
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
  it('normalizes email and enforces password policy on sign-up', () => {
    const ok = signUpSchema.parse({ email: '  Ayse@Example.COM ', password: 'x'.repeat(10) });
    expect(ok.email).toBe('ayse@example.com');
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
  it('does not reveal password policy on sign-in', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});
