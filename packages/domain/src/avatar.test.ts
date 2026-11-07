import { describe, expect, it } from 'vitest';
import { automaticAvatarKey, AVATAR_KEYS, avatarChoices, isAvatarKey } from './avatar';

describe('avatar keys', () => {
  it('are the letters and two sets of eleven, matching the database check', () => {
    expect(AVATAR_KEYS).toHaveLength(23);
    const check =
      /^(letters|[fm]-(general|football|futsal|basketball|volleyball|tennis|padel|badminton|table-tennis|running|walking))$/;
    for (const key of AVATAR_KEYS) expect(key).toMatch(check);
    expect(isAvatarKey('f-tennis')).toBe(true);
    expect(isAvatarKey('x-tennis')).toBe(false);
    expect(isAvatarKey(null)).toBe(false);
  });
});

describe('automaticAvatarKey', () => {
  it('takes the gender’s set and the first sport', () => {
    expect(automaticAvatarKey('FEMALE', 'tennis')).toBe('f-tennis');
    expect(automaticAvatarKey('MALE', 'table-tennis')).toBe('m-table-tennis');
  });
  it('falls back to the general drawing for a sport without one', () => {
    expect(automaticAvatarKey('MALE', 'curling')).toBe('m-general');
    expect(automaticAvatarKey('FEMALE', null)).toBe('f-general');
  });
  it('starts with the letters for "rather not say" or no answer', () => {
    expect(automaticAvatarKey('UNDISCLOSED', 'football')).toBe('letters');
    expect(automaticAvatarKey(null, 'football')).toBe('letters');
  });
});

describe('avatarChoices', () => {
  it('offers the letters and the own set first, the other set on request', () => {
    const { first, rest } = avatarChoices('FEMALE');
    expect(first[0]).toBe('letters');
    expect(first.slice(1).every((k) => k.startsWith('f-'))).toBe(true);
    expect(rest.every((k) => k.startsWith('m-'))).toBe(true);
    expect(first.length + rest.length).toBe(23);
  });
  it('offers everything at once without a gender', () => {
    expect(avatarChoices('UNDISCLOSED')).toEqual({ first: AVATAR_KEYS, rest: [] });
  });
});
