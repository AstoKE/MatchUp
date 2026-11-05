import { describe, expect, it } from 'vitest';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  isSkillLevel,
  onboardingSchema,
  profileEditSchema,
  SKILL_LEVELS,
} from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const validOnboarding = {
  adultConfirmed: true,
  termsAccepted: true,
  marketingConsent: false,
  displayName: 'Ayşe Yılmaz',
  cityId: id(1),
  districtId: id(2),
  sports: [{ sportId: id(3), level: 3.5, positionIds: [id(4)] }],
};

function firstIssue(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe('skill levels', () => {
  it('are half steps from 1 to 5', () => {
    expect(SKILL_LEVELS).toHaveLength(9);
    expect([1, 2.5, 5].every(isSkillLevel)).toBe(true);
    expect([0, 0.5, 3.3, 5.5, 6, NaN, '3', null].some(isSkillLevel)).toBe(false);
  });
});

describe('onboardingSchema', () => {
  it('accepts a complete, valid submission', () => {
    expect(onboardingSchema.safeParse(validOnboarding).success).toBe(true);
  });

  it('keeps Turkish characters and trims the name', () => {
    const parsed = onboardingSchema.parse({ ...validOnboarding, displayName: '  İlker Şahin  ' });
    expect(parsed.displayName).toBe('İlker Şahin');
  });

  it.each([
    ['adultConfirmed', false, 'ADULT_REQUIRED'],
    ['termsAccepted', false, 'TERMS_REQUIRED'],
    ['displayName', 'A', 'NAME_TOO_SHORT'],
    ['displayName', '   ', 'NAME_TOO_SHORT'],
    ['displayName', 'x'.repeat(DISPLAY_NAME_MAX + 1), 'NAME_TOO_LONG'],
    ['displayName', 'Ali\u0007Veli', 'NAME_INVALID'],
    ['displayName', 'ali.com', 'NAME_INVALID'],
    ['displayName', 'Ara 0532 123 45 67', 'NAME_INVALID'],
    ['sports', [], 'SPORTS_REQUIRED'],
  ] as const)('rejects %s = %j with %s', (field, value, key) => {
    const result = onboardingSchema.safeParse({ ...validOnboarding, [field]: value });
    expect(result.success).toBe(false);
    expect(firstIssue(result)).toBe(key);
  });

  it('rejects a district without a city', () => {
    const result = onboardingSchema.safeParse({ ...validOnboarding, cityId: null });
    expect(firstIssue(result)).toBe('DISTRICT_NEEDS_CITY');
  });

  it('allows no location at all (location is optional)', () => {
    expect(
      onboardingSchema.safeParse({ ...validOnboarding, cityId: null, districtId: null }).success,
    ).toBe(true);
  });

  it('rejects the same sport twice, bad levels and too many positions', () => {
    const dup = { sportId: id(3), level: 3, positionIds: [] };
    expect(onboardingSchema.safeParse({ ...validOnboarding, sports: [dup, dup] }).success).toBe(
      false,
    );
    for (const level of [0, 0.5, 3.3, 5.5]) {
      const sports = [{ ...dup, level }];
      expect(firstIssue(onboardingSchema.safeParse({ ...validOnboarding, sports }))).toBe(
        'LEVEL_INVALID',
      );
    }
    // Not a number at all (never sent by the app): still rejected, just not with our key.
    const asText = [{ ...dup, level: '3' }];
    expect(onboardingSchema.safeParse({ ...validOnboarding, sports: asText }).success).toBe(false);
    const four = { ...dup, positionIds: [id(4), id(5), id(6), id(7)] };
    expect(firstIssue(onboardingSchema.safeParse({ ...validOnboarding, sports: [four] }))).toBe(
      'TOO_MANY_POSITIONS',
    );
    const repeated = { ...dup, positionIds: [id(4), id(4)] };
    expect(onboardingSchema.safeParse({ ...validOnboarding, sports: [repeated] }).success).toBe(
      false,
    );
  });

  it('rejects more than ten sports and malformed ids', () => {
    const many = Array.from({ length: 11 }, (_, n) => ({
      sportId: id(100 + n),
      level: 3,
      positionIds: [],
    }));
    expect(onboardingSchema.safeParse({ ...validOnboarding, sports: many }).success).toBe(false);
    const bad = [{ sportId: 'nope', level: 3, positionIds: [] }];
    expect(onboardingSchema.safeParse({ ...validOnboarding, sports: bad }).success).toBe(false);
  });
});

describe('profileEditSchema', () => {
  const base = { displayName: 'Ayşe', bio: '', cityId: null, districtId: null };

  it('turns an empty bio into null and trims text', () => {
    expect(profileEditSchema.parse(base).bio).toBeNull();
    expect(profileEditSchema.parse({ ...base, bio: '  Halı saha  ' }).bio).toBe('Halı saha');
  });

  it('allows line breaks in a bio but not other control characters', () => {
    expect(profileEditSchema.safeParse({ ...base, bio: 'a\nb\tc' }).success).toBe(true);
    expect(firstIssue(profileEditSchema.safeParse({ ...base, bio: 'a\u0001b' }))).toBe(
      'BIO_INVALID',
    );
  });

  it('rejects a district without a city, like onboarding does', () => {
    const result = profileEditSchema.safeParse({ ...base, districtId: id(2) });
    expect(firstIssue(result)).toBe('DISTRICT_NEEDS_CITY');
    expect(profileEditSchema.safeParse({ ...base, cityId: id(1), districtId: id(2) }).success).toBe(
      true,
    );
  });

  it(`rejects bios over ${BIO_MAX} characters`, () => {
    expect(firstIssue(profileEditSchema.safeParse({ ...base, bio: 'x'.repeat(BIO_MAX + 1) }))).toBe(
      'BIO_TOO_LONG',
    );
    expect(profileEditSchema.safeParse({ ...base, bio: 'x'.repeat(BIO_MAX) }).success).toBe(true);
  });
});
