import * as z from 'zod/mini';

/**
 * Profile / onboarding input rules. They mirror the database checks (migration
 * 20261025110000_onboarding_and_profiles.sql) so the app can reject early; the database remains the
 * authority. Validation messages are STABLE KEYS (not prose) so the UI can localize them.
 * Uses `zod/mini` (docs/PERFORMANCE.md).
 */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 280;
export const MAX_POSITIONS_PER_SPORT = 3;
export const MAX_SPORTS_PER_ONBOARDING = 10;

/** Self-assessed skill moves in half steps from 1 to 5 (RATING_SYSTEM §3.2). */
export const SKILL_LEVELS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === 'number' && (SKILL_LEVELS as readonly number[]).includes(value);
}

export const PROFILE_VALIDATION_KEYS = [
  'NAME_TOO_SHORT',
  'NAME_TOO_LONG',
  'NAME_INVALID',
  'BIO_TOO_LONG',
  'BIO_INVALID',
  'LEVEL_INVALID',
  'SPORTS_REQUIRED',
  'TOO_MANY_SPORTS',
  'TOO_MANY_POSITIONS',
  'ADULT_REQUIRED',
  'TERMS_REQUIRED',
  'DISTRICT_NEEDS_CITY',
] as const;
export type ProfileValidationKey = (typeof PROFILE_VALIDATION_KEYS)[number];

export function isProfileValidationKey(value: unknown): value is ProfileValidationKey {
  return (
    typeof value === 'string' && (PROFILE_VALIDATION_KEYS as readonly string[]).includes(value)
  );
}

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
// A bio may span lines (\t \n \r allowed), matching the database check.
// eslint-disable-next-line no-control-regex -- see above
const BIO_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const displayNameSchema = z.string().check(
  z.trim(),
  z.minLength(DISPLAY_NAME_MIN, 'NAME_TOO_SHORT'),
  z.maxLength(DISPLAY_NAME_MAX, 'NAME_TOO_LONG'),
  z.refine((value) => !CONTROL_CHARS.test(value), 'NAME_INVALID'),
);

/** Empty input means "no bio"; the result is trimmed text or null. */
export const bioSchema = z.pipe(
  z.string().check(
    z.trim(),
    z.maxLength(BIO_MAX, 'BIO_TOO_LONG'),
    z.refine((value) => !BIO_FORBIDDEN.test(value), 'BIO_INVALID'),
  ),
  z.transform((value): string | null => (value === '' ? null : value)),
);

const idSchema = z.uuid();

export const sportSelectionSchema = z.object({
  sportId: idSchema,
  // `custom` keeps the narrow SkillLevel type that a plain number check would lose.
  level: z.custom<SkillLevel>((value) => isSkillLevel(value), 'LEVEL_INVALID'),
  positionIds: z.array(idSchema).check(
    z.maxLength(MAX_POSITIONS_PER_SPORT, 'TOO_MANY_POSITIONS'),
    z.refine((ids) => new Set(ids).size === ids.length, 'TOO_MANY_POSITIONS'),
  ),
});
export type SportSelection = z.infer<typeof sportSelectionSchema>;

/** 1–10 sports, each at most once (used by onboarding and by editing the sports later). */
export const sportListSchema = z.array(sportSelectionSchema).check(
  z.minLength(1, 'SPORTS_REQUIRED'),
  z.maxLength(MAX_SPORTS_PER_ONBOARDING, 'TOO_MANY_SPORTS'),
  z.refine(
    (items) => new Set(items.map((s) => s.sportId)).size === items.length,
    'TOO_MANY_SPORTS',
  ),
);

/** A district only makes sense inside a city (mirrors the composite foreign key in the database). */
const districtNeedsCity = z.refine<{ cityId: string | null; districtId: string | null }>(
  (value) => value.districtId === null || value.cityId !== null,
  { error: 'DISTRICT_NEEDS_CITY', path: ['districtId'] },
);

export const profileLocationSchema = z
  .object({ cityId: z.nullable(idSchema), districtId: z.nullable(idSchema) })
  .check(districtNeedsCity);

export const profileEditSchema = z
  .object({
    displayName: displayNameSchema,
    bio: bioSchema,
    cityId: z.nullable(idSchema),
    districtId: z.nullable(idSchema),
  })
  .check(districtNeedsCity);
export type ProfileEditInput = z.infer<typeof profileEditSchema>;

export const onboardingSchema = z
  .object({
    adultConfirmed: z.literal(true, 'ADULT_REQUIRED'),
    termsAccepted: z.literal(true, 'TERMS_REQUIRED'),
    marketingConsent: z.boolean(),
    displayName: displayNameSchema,
    cityId: z.nullable(idSchema),
    districtId: z.nullable(idSchema),
    sports: sportListSchema,
  })
  .check(districtNeedsCity);
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const PROFILE_VISIBILITIES = ['EVERYONE', 'EVENT_PEERS'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
