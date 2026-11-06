import {
  BOOKING_STATUSES,
  EVENT_SETTINGS,
  mapRpcError,
  POINT_PRECISIONS,
  type EventSetting,
  type GeoPoint,
  type PointPrecision,
  type SearchPayload,
  type VenueBrief,
} from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';
import { pointRow, venueBriefRow } from './events-api';

const cursorSchema = z.object({ starts_at: z.string(), id: z.string() });
export type SearchCursor = z.infer<typeof cursorSchema>;

export const itemRow = z.object({
  id: z.uuid(),
  title: z.string(),
  sport_id: z.uuid(),
  sport_format_id: z.uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  duration_minutes: z.number(),
  city_id: z.uuid(),
  district_id: z.uuid(),
  place_label: z.nullable(z.string()),
  capacity: z.number(),
  approved_count: z.number(),
  open_slots: z.number(),
  registration_open: z.boolean(),
  waitlist_enabled: z.boolean(),
  skill_min: z.nullable(z.number()),
  skill_max: z.nullable(z.number()),
  cost_amount_minor: z.nullable(z.number()),
  cost_note: z.nullable(z.string()),
  booking_status: z.enum(BOOKING_STATUSES),
  setting: z.nullable(z.enum(EVENT_SETTINGS)),
  organizer_name: z.nullable(z.string()),
  // Phase 4, optional for a hosted database without that migration.
  point: z.optional(z.nullable(pointRow)),
  point_precision: z.optional(z.enum(POINT_PRECISIONS)),
  venue: z.optional(z.nullable(venueBriefRow)),
  distance_m: z.optional(z.nullable(z.number())),
});

const pageRow = z.object({
  items: z.array(itemRow),
  next_cursor: z.nullable(cursorSchema),
});

/** One row of the Discover list: only what the guest-readable `search_events` returns. */
export interface EventListItem {
  id: string;
  title: string;
  sportId: string;
  formatId: string;
  startsAt: string;
  durationMinutes: number;
  cityId: string;
  districtId: string;
  /** Null when the organizer hides the place until approval. */
  placeLabel: string | null;
  capacity: number;
  approvedCount: number;
  openSlots: number;
  registrationOpen: boolean;
  waitlistEnabled: boolean;
  skillMin: number | null;
  skillMax: number | null;
  costAmountMinor: number | null;
  costNote: string | null;
  /** Indoor / outdoor as the organizer stated it, or null. */
  setting: EventSetting | null;
  organizerName: string | null;
  /** Phase 4: the public point, its precision, the venue of a public location, and the distance when searched near. */
  point?: GeoPoint | null;
  pointPrecision?: PointPrecision | null;
  venue?: VenueBrief | null;
  distanceM?: number | null;
}

export interface EventListPage {
  items: EventListItem[];
  nextCursor: SearchCursor | null;
}

/** Open to guests (D-09); the server pages by (starts_at, id) and caps the page size. */
export async function searchEvents(
  payload: SearchPayload,
  cursor: SearchCursor | null,
): Promise<EventListPage> {
  const { data, error } = await supabase.rpc('search_events', {
    p_filters: payload,
    p_cursor: cursor ?? undefined,
  });
  if (error) throw mapRpcError(error);
  const page = pageRow.parse(data);
  return { items: page.items.map(toListItem), nextCursor: page.next_cursor };
}

export function toListItem(row: z.infer<typeof itemRow>): EventListItem {
  return {
    id: row.id,
    title: row.title,
    sportId: row.sport_id,
    formatId: row.sport_format_id,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    cityId: row.city_id,
    districtId: row.district_id,
    placeLabel: row.place_label,
    capacity: row.capacity,
    approvedCount: row.approved_count,
    openSlots: row.open_slots,
    registrationOpen: row.registration_open,
    waitlistEnabled: row.waitlist_enabled,
    skillMin: row.skill_min,
    skillMax: row.skill_max,
    costAmountMinor: row.cost_amount_minor,
    costNote: row.cost_note,
    setting: row.setting,
    organizerName: row.organizer_name,
    point: row.point ?? null,
    pointPrecision: row.point_precision ?? null,
    venue: row.venue ?? null,
    distanceM: row.distance_m ?? null,
  };
}
