/**
 * Phase 8 / M3 (ADR-0027): the drawn avatars. Two sets of eleven (a general one and one per sport), plus "letters"
 * (the initials). The database accepts exactly these keys (profiles.avatar_key check, set_my_avatar).
 */
export const GENDERS = ['FEMALE', 'MALE', 'UNDISCLOSED'] as const;
export type Gender = (typeof GENDERS)[number];

export const AVATAR_SPORTS = [
  'general',
  'football',
  'futsal',
  'basketball',
  'volleyball',
  'tennis',
  'padel',
  'badminton',
  'table-tennis',
  'running',
  'walking',
] as const;
export type AvatarSport = (typeof AVATAR_SPORTS)[number];
export type AvatarSet = 'f' | 'm';
export type DrawnAvatarKey = `${AvatarSet}-${AvatarSport}`;
export type AvatarKey = DrawnAvatarKey | 'letters';

export const LETTERS_AVATAR = 'letters' as const;

const drawn = (set: AvatarSet): DrawnAvatarKey[] =>
  AVATAR_SPORTS.map((sport) => `${set}-${sport}` as const);
export const AVATAR_KEYS: readonly AvatarKey[] = [LETTERS_AVATAR, ...drawn('m'), ...drawn('f')];

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === 'string' && (AVATAR_KEYS as readonly string[]).includes(value);
}

/** The set a gender is offered first; none for "rather not say" (every drawing is offered, letters by default). */
export function avatarSetFor(gender: Gender | null): AvatarSet | null {
  if (gender === 'FEMALE') return 'f';
  if (gender === 'MALE') return 'm';
  return null;
}

/**
 * The drawing given automatically after onboarding: the gender's set, the first chosen sport's drawing (the general one
 * for a sport without a drawing). "Rather not say" or no gender starts with the letters.
 */
export function automaticAvatarKey(
  gender: Gender | null,
  firstSportSlug: string | null,
): AvatarKey {
  const set = avatarSetFor(gender);
  if (set === null) return LETTERS_AVATAR;
  const sport = (AVATAR_SPORTS as readonly string[]).includes(firstSportSlug ?? '')
    ? (firstSportSlug as AvatarSport)
    : 'general';
  return `${set}-${sport}`;
}

/** The drawings to show first, then the rest ("show all avatars"). */
export function avatarChoices(gender: Gender | null): {
  first: readonly AvatarKey[];
  rest: readonly AvatarKey[];
} {
  const set = avatarSetFor(gender);
  if (set === null) return { first: AVATAR_KEYS, rest: [] };
  return { first: [LETTERS_AVATAR, ...drawn(set)], rest: drawn(set === 'f' ? 'm' : 'f') };
}
