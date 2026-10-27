/**
 * Event form rules. They mirror `private.parse_event_input` and the publish guards in migration
 * 20261027100000_event_core.sql so the app can reject early; the database stays the authority (it
 * also enforces quotas and the configured lead time). Messages are STABLE KEYS for the UI to localize.
 */
export const EVENT_TITLE_MIN = 3;
export const EVENT_TITLE_MAX = 80;
export const EVENT_DESCRIPTION_MAX = 2000;
export const EVENT_DURATION_MIN = 15;
export const EVENT_DURATION_MAX = 480;
export const EVENT_PLACE_MIN = 3;
export const EVENT_PLACE_MAX = 120;
export const EVENT_ADDRESS_MAX = 300;
export const EVENT_NOTES_MAX = 1000;
export const EVENT_COST_NOTE_MAX = 200;
export const EVENT_EQUIPMENT_MAX = 500;
export const EVENT_CANCEL_MESSAGE_MAX = 500;
/** Upper bound of the informational cost, in kuruş (100 000 TL). */
export const EVENT_COST_MAX_MINOR = 10_000_000;
/** Default publish lead time; the server reads the real value from app_config. */
export const EVENT_MIN_LEAD_MINUTES = 60;
/** Events can be planned at most a year ahead (same bound as the server). */
export const EVENT_MAX_DAYS_AHEAD = 365;

export const EVENT_VISIBILITIES = ['PUBLIC', 'INVITE_ONLY'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];
export const LOCATION_VISIBILITIES = ['PUBLIC', 'APPROVED_ONLY'] as const;
export type LocationVisibility = (typeof LOCATION_VISIBILITIES)[number];
export const BOOKING_STATUSES = [
  'NOT_REQUIRED',
  'NOT_YET_BOOKED',
  'BOOKED_EXTERNALLY',
  'TO_BE_CONFIRMED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const EVENT_CANCEL_REASONS = [
  'WEATHER',
  'VENUE_UNAVAILABLE',
  'NOT_ENOUGH_PLAYERS',
  'ORGANIZER_UNAVAILABLE',
  'OTHER',
] as const;
export type EventCancelReason = (typeof EVENT_CANCEL_REASONS)[number];
export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELED', 'COMPLETED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_VALIDATION_KEYS = [
  'SPORT_REQUIRED',
  'FORMAT_REQUIRED',
  'TITLE_TOO_SHORT',
  'TITLE_TOO_LONG',
  'DESCRIPTION_TOO_LONG',
  'DATE_INVALID',
  'TIME_INVALID',
  'START_IN_PAST',
  'START_TOO_SOON',
  'START_TOO_FAR',
  'DURATION_INVALID',
  'DISTRICT_REQUIRED',
  'PLACE_TOO_SHORT',
  'PLACE_TOO_LONG',
  'ADDRESS_TOO_LONG',
  'NOTES_TOO_LONG',
  'CAPACITY_OUT_OF_RANGE',
  'SKILL_RANGE_INVALID',
  'COST_INVALID',
  'COST_NOTE_TOO_LONG',
  'EQUIPMENT_TOO_LONG',
  'CANCEL_REASON_REQUIRED',
  'CANCEL_MESSAGE_TOO_LONG',
] as const;
export type EventValidationKey = (typeof EVENT_VALIDATION_KEYS)[number];

/** What the organizer types/chooses. Dates are local to the event's city (`timeZone`). */
export interface EventDraft {
  sportId: string | null;
  formatId: string | null;
  title: string;
  description: string;
  /** Local date `YYYY-MM-DD`. */
  date: string;
  /** Local time `HH:MM`. */
  time: string;
  durationMinutes: number;
  cityId: string | null;
  districtId: string | null;
  locationVisibility: LocationVisibility;
  placeLabel: string;
  addressText: string;
  participantNotes: string;
  capacity: number;
  organizerPlays: boolean;
  waitlistEnabled: boolean;
  visibility: EventVisibility;
  skillMin: number | null;
  skillMax: number | null;
  bookingStatus: BookingStatus;
  /** Informational cost in TL as typed ("150", "150,50"); empty = none. */
  costText: string;
  costNote: string;
  equipmentNote: string;
}

export interface FormatBounds {
  min: number;
  max: number;
}

export type EventDraftErrors = Partial<Record<keyof EventDraft, EventValidationKey>>;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const LINE_CONTROL = /[\u0000-\u001F\u007F]/;

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** "25.10.2026" (Turkish order, also with / or -) → "2026-10-25"; null when it is not a real date. */
export function parseTypedDate(text: string): string | null {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isValidDate(iso) ? iso : null;
}

/** "2026-10-25" → "25.10.2026". */
export function formatTypedDate(isoDate: string): string {
  const m = DATE_RE.exec(isoDate);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** "9:5", "09.05", "0905" → "09:05"; null when it is not a valid time. */
export function parseTypedTime(text: string): string | null {
  const m = /^\s*(\d{1,2})[:.]?(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const value = `${m[1]!.padStart(2, '0')}:${m[2]}`;
  return TIME_RE.test(value) ? value : null;
}

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Local wall time in `timeZone` → UTC ISO string (correct across DST changes). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): string {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) throw new RangeError('invalid date or time');
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let utc = wall - zoneOffset(wall, timeZone);
  utc = wall - zoneOffset(utc, timeZone);
  return new Date(utc).toISOString();
}

/** UTC instant → local `{ date, time }` in `timeZone` (for editing an existing event). */
export function utcToZonedParts(iso: string, timeZone: string): { date: string; time: string } {
  const ms = Date.parse(iso);
  const local = new Date(ms + zoneOffset(ms, timeZone));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

/** "150", "150,5", "150.50", "1.500,00" → kuruş; empty → null; anything else → NaN. */
export function parseCostToMinor(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const m =
    /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(trimmed) ??
    /^(\d+)(?:\.(\d{1,2}))$/.exec(trimmed);
  if (!m) return Number.NaN;
  const whole = Number(m[1]!.replace(/\./g, ''));
  const fraction = Number((m[2] ?? '0').padEnd(2, '0'));
  return whole * 100 + fraction;
}

export interface EventValidationContext {
  format: FormatBounds | null;
  timeZone: string;
  now: Date;
  /** Publishing enforces the lead time; saving a draft only needs a future start. */
  publishing: boolean;
  minLeadMinutes?: number;
}

export function validateEventDraft(
  draft: EventDraft,
  ctx: EventValidationContext,
): EventDraftErrors {
  const errors: EventDraftErrors = {};
  if (!draft.sportId) errors.sportId = 'SPORT_REQUIRED';
  if (!draft.formatId || !ctx.format) errors.formatId = 'FORMAT_REQUIRED';

  const title = collapse(draft.title);
  if (title.length < EVENT_TITLE_MIN || LINE_CONTROL.test(title)) errors.title = 'TITLE_TOO_SHORT';
  else if (title.length > EVENT_TITLE_MAX) errors.title = 'TITLE_TOO_LONG';
  if (draft.description.trim().length > EVENT_DESCRIPTION_MAX)
    errors.description = 'DESCRIPTION_TOO_LONG';

  const dateOk = isValidDate(draft.date);
  const timeOk = TIME_RE.test(draft.time);
  if (!dateOk) errors.date = 'DATE_INVALID';
  if (!timeOk) errors.time = 'TIME_INVALID';
  if (dateOk && timeOk) {
    const start = Date.parse(zonedTimeToUtc(draft.date, draft.time, ctx.timeZone));
    const now = ctx.now.getTime();
    const lead = (ctx.minLeadMinutes ?? EVENT_MIN_LEAD_MINUTES) * 60_000;
    if (start <= now) errors.date = 'START_IN_PAST';
    else if (ctx.publishing && start < now + lead) errors.date = 'START_TOO_SOON';
    else if (start > now + EVENT_MAX_DAYS_AHEAD * 86_400_000) errors.date = 'START_TOO_FAR';
  }
  if (
    !Number.isInteger(draft.durationMinutes) ||
    draft.durationMinutes < EVENT_DURATION_MIN ||
    draft.durationMinutes > EVENT_DURATION_MAX
  ) {
    errors.durationMinutes = 'DURATION_INVALID';
  }

  if (!draft.cityId || !draft.districtId) errors.districtId = 'DISTRICT_REQUIRED';
  const place = collapse(draft.placeLabel);
  if (place.length < EVENT_PLACE_MIN) errors.placeLabel = 'PLACE_TOO_SHORT';
  else if (place.length > EVENT_PLACE_MAX) errors.placeLabel = 'PLACE_TOO_LONG';
  if (draft.addressText.trim().length > EVENT_ADDRESS_MAX) errors.addressText = 'ADDRESS_TOO_LONG';
  if (draft.participantNotes.trim().length > EVENT_NOTES_MAX)
    errors.participantNotes = 'NOTES_TOO_LONG';

  if (
    ctx.format &&
    (!Number.isInteger(draft.capacity) ||
      draft.capacity < ctx.format.min ||
      draft.capacity > ctx.format.max)
  ) {
    errors.capacity = 'CAPACITY_OUT_OF_RANGE';
  }
  const skillOk = (v: number | null) => v === null || (v >= 1 && v <= 5 && Number.isInteger(v * 2));
  if (
    !skillOk(draft.skillMin) ||
    !skillOk(draft.skillMax) ||
    (draft.skillMin !== null && draft.skillMax !== null && draft.skillMin > draft.skillMax)
  ) {
    errors.skillMin = 'SKILL_RANGE_INVALID';
  }

  const cost = parseCostToMinor(draft.costText);
  if (cost !== null && (Number.isNaN(cost) || cost > EVENT_COST_MAX_MINOR))
    errors.costText = 'COST_INVALID';
  if (draft.costNote.trim().length > EVENT_COST_NOTE_MAX) errors.costNote = 'COST_NOTE_TOO_LONG';
  if (draft.equipmentNote.trim().length > EVENT_EQUIPMENT_MAX)
    errors.equipmentNote = 'EQUIPMENT_TOO_LONG';
  return errors;
}

/** Flat JSON object: what create_event / update_event accept as `p_input`. */
export type EventInputPayload = Record<string, string | number | boolean | null>;

/** The jsonb payload for create_event / update_event (keys as the server's parse_event_input reads them). */
export function toEventInput(draft: EventDraft, timeZone: string): EventInputPayload {
  const text = (value: string) => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };
  return {
    sport_id: draft.sportId,
    sport_format_id: draft.formatId,
    title: collapse(draft.title),
    description: text(draft.description),
    visibility: draft.visibility,
    starts_at: zonedTimeToUtc(draft.date, draft.time, timeZone),
    duration_minutes: draft.durationMinutes,
    city_id: draft.cityId,
    district_id: draft.districtId,
    location_visibility: draft.locationVisibility,
    location_label: collapse(draft.placeLabel),
    address_text: text(draft.addressText),
    participant_notes: text(draft.participantNotes),
    capacity: draft.capacity,
    waitlist_enabled: draft.waitlistEnabled,
    organizer_plays: draft.organizerPlays,
    skill_min: draft.skillMin,
    skill_max: draft.skillMax,
    booking_status: draft.bookingStatus,
    cost_amount_minor: parseCostToMinor(draft.costText),
    cost_note: text(draft.costNote),
    equipment_note: text(draft.equipmentNote),
  };
}

export function validateCancel(
  reason: string | null,
  message: string,
): {
  reason?: EventValidationKey;
  message?: EventValidationKey;
} {
  const errors: { reason?: EventValidationKey; message?: EventValidationKey } = {};
  if (!reason || !(EVENT_CANCEL_REASONS as readonly string[]).includes(reason)) {
    errors.reason = 'CANCEL_REASON_REQUIRED';
  }
  if (message.trim().length > EVENT_CANCEL_MESSAGE_MAX) errors.message = 'CANCEL_MESSAGE_TOO_LONG';
  return errors;
}
