/**
 * Search over Turkish place names: case and the Turkish letters are folded, so "izmir", "IZMIR" and "İzmir" all find
 * İzmir, and "sanliurfa" finds Şanlıurfa. Lower-casing uses the tr locale, so "I" becomes "ı" before it is folded to "i".
 */
const FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

export function foldTurkish(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Options whose label contains the query, those that start with it first; an empty query keeps them all. */
export function filterByName<T extends { label: string }>(
  options: readonly T[],
  query: string,
): T[] {
  const q = foldTurkish(query);
  if (q === '') return [...options];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const option of options) {
    const label = foldTurkish(option.label);
    if (label.startsWith(q)) starts.push(option);
    else if (label.includes(q)) contains.push(option);
  }
  return [...starts, ...contains];
}

/**
 * The province Discover and a new event start from: the one on the profile, else the one last picked on this device,
 * else Ankara. A stored id that is no longer in the catalog is ignored.
 */
export function defaultCityId(
  cities: readonly { id: string; slug: string }[],
  options: { profileCityId?: string | null; storedCityId?: string | null },
): string | null {
  const known = (id: string | null | undefined) =>
    id && cities.some((c) => c.id === id) ? id : null;
  return (
    known(options.profileCityId) ??
    known(options.storedCityId) ??
    cities.find((c) => c.slug === 'ankara')?.id ??
    cities[0]?.id ??
    null
  );
}

/** A point as the server sends it (WGS 84, 6 decimals). A type alias, so it fits the generated `Json` argument type. */
export type GeoPoint = { lat: number; lon: number };

/** How a public point relates to the place: the pin itself, its ~500 m cell (location hidden), or only the district. */
export const POINT_PRECISIONS = ['EXACT', 'APPROXIMATE', 'DISTRICT'] as const;
export type PointPrecision = (typeof POINT_PRECISIONS)[number];

export const VENUE_KINDS = ['PUBLIC_SPACE', 'COMMERCIAL_FACILITY'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

/** A venue as an event or a list shows it. "verified" is an administrator's check, never a booking. */
export interface VenueBrief {
  id: string;
  name: string;
  kind: VenueKind;
  verified: boolean;
}

/** A distance for a card: "850 m" under a kilometre, "1,2 km" / "1.2 km" up to 10 km, whole kilometres beyond. */
export function formatDistance(meters: number, locale: string): string {
  if (meters < 1000) return `${Math.max(100, Math.round(meters / 100) * 100)} m`;
  const km = meters / 1000;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}
