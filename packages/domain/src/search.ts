import { utcToZonedParts, zonedTimeToUtc, type EventSetting } from './event';

/**
 * Discovery filters as the Discover screen holds them, and their translation to the `search_events`
 * payload (migration 20261028100000). Dates are resolved in the city's time zone so "today" means the
 * organizer's and the player's day, not the device's; the database stays the authority on every bound.
 */
export const SEARCH_PAGE_SIZE = 20;

export const TIME_OF_DAY_PARTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
export type TimeOfDay = (typeof TIME_OF_DAY_PARTS)[number];

/** The My Events tabs (PRD §4.5) and the buckets `list_my_events` understands. */
export const MY_EVENT_BUCKETS = [
  'ORGANIZING',
  'PENDING',
  'APPROVED',
  'WAITLISTED',
  'PAST',
] as const;
export type MyEventBucket = (typeof MY_EVENT_BUCKETS)[number];

export const DATE_PRESETS = ['ANY', 'TODAY', 'TOMORROW', 'WEEK'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export interface DiscoverFilters {
  datePreset: DatePreset;
  timeOfDay: readonly TimeOfDay[];
  sportIds: readonly string[];
  districtId: string | null;
  setting: EventSetting | null;
  onlyOpen: boolean;
}

export const EMPTY_DISCOVER_FILTERS: DiscoverFilters = {
  datePreset: 'ANY',
  timeOfDay: [],
  sportIds: [],
  districtId: null,
  setting: null,
  onlyOpen: false,
};

/** The `p_filters` object of `search_events`; absent keys mean "no restriction". */
// A type alias, not an interface: it must be assignable to the generated `Json` argument type.
export type SearchPayload = {
  city_id?: string;
  district_ids?: string[];
  sport_ids?: string[];
  time_of_day?: TimeOfDay[];
  setting?: EventSetting;
  only_open?: true;
  from?: string;
  to?: string;
  limit: number;
};

/** How many filters are switched on (the "clear filters" button shows when this is above zero). */
export function activeFilterCount(filters: DiscoverFilters): number {
  return (
    (filters.datePreset === 'ANY' ? 0 : 1) +
    (filters.timeOfDay.length > 0 ? 1 : 0) +
    (filters.sportIds.length > 0 ? 1 : 0) +
    (filters.districtId === null ? 0 : 1) +
    (filters.setting === null ? 0 : 1) +
    (filters.onlyOpen ? 1 : 0)
  );
}

/** `YYYY-MM-DD` plus whole days (calendar arithmetic, no time zone involved). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function buildSearchPayload(
  filters: DiscoverFilters,
  options: { now: Date; timeZone: string; cityId?: string | null },
): SearchPayload {
  const payload: SearchPayload = { limit: SEARCH_PAGE_SIZE };
  if (options.cityId) payload.city_id = options.cityId;
  if (filters.districtId) payload.district_ids = [filters.districtId];
  if (filters.sportIds.length > 0) payload.sport_ids = [...filters.sportIds];
  if (filters.timeOfDay.length > 0) payload.time_of_day = [...filters.timeOfDay];
  if (filters.setting) payload.setting = filters.setting;
  if (filters.onlyOpen) payload.only_open = true;

  if (filters.datePreset !== 'ANY') {
    const today = utcToZonedParts(options.now.toISOString(), options.timeZone).date;
    const startOf = (offset: number) =>
      zonedTimeToUtc(addDays(today, offset), '00:00', options.timeZone);
    if (filters.datePreset === 'TODAY') {
      payload.to = startOf(1);
    } else if (filters.datePreset === 'TOMORROW') {
      payload.from = startOf(1);
      payload.to = startOf(2);
    } else {
      payload.to = startOf(7);
    }
  }
  return payload;
}

export interface DayGroup<T> {
  /** The local calendar day, `YYYY-MM-DD`, in the city's time zone. */
  date: string;
  items: T[];
}

/**
 * Splits an already ordered list into runs of the same local day, keeping the order. The day is the city's
 * (a 00:30 start belongs to the new day for the players there, whatever UTC says).
 */
export function groupByLocalDay<T extends { startsAt: string }>(
  items: readonly T[],
  timeZone: string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const date = utcToZonedParts(item.startsAt, timeZone).date;
    const last = groups.at(-1);
    if (last && last.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

/** "TODAY" / "TOMORROW" for the two days people say by name, otherwise null (the UI then names the weekday). */
export function relativeDay(
  date: string,
  now: Date,
  timeZone: string,
): 'TODAY' | 'TOMORROW' | null {
  const today = utcToZonedParts(now.toISOString(), timeZone).date;
  if (date === today) return 'TODAY';
  if (date === addDays(today, 1)) return 'TOMORROW';
  return null;
}
