import {
  BOOKING_STATUSES,
  EVENT_CANCEL_REASONS,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
  LOCATION_VISIBILITIES,
  mapRpcError,
  type EventCancelReason,
  type EventInputPayload,
} from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

const privateRow = z.object({
  location_label: z.string(),
  address_text: z.nullable(z.string()),
  participant_notes: z.nullable(z.string()),
});

const eventRow = z.object({
  id: z.uuid(),
  organizer_id: z.uuid(),
  status: z.enum(EVENT_STATUSES),
  title: z.string(),
  description: z.nullable(z.string()),
  sport_id: z.uuid(),
  sport_format_id: z.uuid(),
  visibility: z.enum(EVENT_VISIBILITIES),
  starts_at: z.string(),
  duration_minutes: z.number(),
  ends_at: z.string(),
  city_id: z.uuid(),
  district_id: z.uuid(),
  location_visibility: z.enum(LOCATION_VISIBILITIES),
  public_location_label: z.nullable(z.string()),
  capacity: z.number(),
  approved_count: z.number(),
  waitlist_enabled: z.boolean(),
  auto_approve: z.boolean(),
  organizer_plays: z.boolean(),
  skill_min: z.nullable(z.number()),
  skill_max: z.nullable(z.number()),
  booking_status: z.enum(BOOKING_STATUSES),
  cost_amount_minor: z.nullable(z.number()),
  cost_note: z.nullable(z.string()),
  equipment_note: z.nullable(z.string()),
  cancel_reason: z.nullable(z.enum(EVENT_CANCEL_REASONS)),
  cancel_message: z.nullable(z.string()),
});

const EVENT_COLUMNS =
  'id, organizer_id, status, title, description, sport_id, sport_format_id, visibility, starts_at, ' +
  'duration_minutes, ends_at, city_id, district_id, location_visibility, public_location_label, capacity, ' +
  'approved_count, waitlist_enabled, auto_approve, organizer_plays, skill_min, skill_max, booking_status, ' +
  'cost_amount_minor, cost_note, equipment_note, cancel_reason, cancel_message';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EventDetails {
  id: string;
  organizerId: string;
  status: z.infer<typeof eventRow>['status'];
  title: string;
  description: string | null;
  sportId: string;
  formatId: string;
  visibility: z.infer<typeof eventRow>['visibility'];
  startsAt: string;
  durationMinutes: number;
  endsAt: string;
  cityId: string;
  districtId: string;
  locationVisibility: z.infer<typeof eventRow>['location_visibility'];
  /** Shown to everyone only when the location is public. */
  publicPlaceLabel: string | null;
  capacity: number;
  approvedCount: number;
  waitlistEnabled: boolean;
  autoApprove: boolean;
  organizerPlays: boolean;
  skillMin: number | null;
  skillMax: number | null;
  bookingStatus: z.infer<typeof eventRow>['booking_status'];
  costAmountMinor: number | null;
  costNote: string | null;
  equipmentNote: string | null;
  cancelReason: EventCancelReason | null;
  cancelMessage: string | null;
  /** Organizer and approved participants only (RLS); null for everyone else. */
  private: {
    placeLabel: string;
    addressText: string | null;
    participantNotes: string | null;
  } | null;
}

/**
 * One event as the viewer may see it (guests included, D-09), or null when it does not exist for them.
 * Private details are a second query, only with a session: guests have no grant on that table at all,
 * and RLS returns no row to signed-in users who are neither organizer nor approved.
 */
export async function fetchEvent(id: string): Promise<EventDetails | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw mapRpcError(error);
  if (!data) return null;
  const row = eventRow.parse(data);
  let p: z.infer<typeof privateRow> | null = null;
  const { data: session } = await supabase.auth.getSession();
  if (session.session) {
    const details = await supabase
      .from('event_private_details')
      .select('location_label, address_text, participant_notes')
      .eq('event_id', id)
      .maybeSingle();
    if (details.error) throw mapRpcError(details.error);
    p = details.data ? privateRow.parse(details.data) : null;
  }
  return {
    id: row.id,
    organizerId: row.organizer_id,
    status: row.status,
    title: row.title,
    description: row.description,
    sportId: row.sport_id,
    formatId: row.sport_format_id,
    visibility: row.visibility,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    endsAt: row.ends_at,
    cityId: row.city_id,
    districtId: row.district_id,
    locationVisibility: row.location_visibility,
    publicPlaceLabel: row.public_location_label,
    capacity: row.capacity,
    approvedCount: row.approved_count,
    waitlistEnabled: row.waitlist_enabled,
    autoApprove: row.auto_approve,
    organizerPlays: row.organizer_plays,
    skillMin: row.skill_min,
    skillMax: row.skill_max,
    bookingStatus: row.booking_status,
    costAmountMinor: row.cost_amount_minor,
    costNote: row.cost_note,
    equipmentNote: row.equipment_note,
    cancelReason: row.cancel_reason,
    cancelMessage: row.cancel_message,
    private: p
      ? {
          placeLabel: p.location_label,
          addressText: p.address_text,
          participantNotes: p.participant_notes,
        }
      : null,
  };
}

/** Idempotent per clientRequestId: a retry after a lost response returns the same event. */
export async function createEvent(args: {
  clientRequestId: string;
  input: EventInputPayload;
  publish: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_event', {
    p_client_request_id: args.clientRequestId,
    p_input: args.input,
    p_publish: args.publish,
  });
  if (error) throw mapRpcError(error);
  return z.uuid().parse(data);
}

export async function updateEvent(args: { id: string; input: EventInputPayload }): Promise<void> {
  const { error } = await supabase.rpc('update_event', {
    p_event_id: args.id,
    p_input: args.input,
  });
  if (error) throw mapRpcError(error);
}

export async function publishEvent(id: string): Promise<void> {
  const { error } = await supabase.rpc('publish_event', { p_event_id: id });
  if (error) throw mapRpcError(error);
}

export async function cancelEvent(args: {
  id: string;
  reason: EventCancelReason;
  message: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('cancel_event', {
    p_event_id: args.id,
    p_reason: args.reason,
    p_message: args.message ?? undefined,
  });
  if (error) throw mapRpcError(error);
}

export async function completeEvent(id: string): Promise<void> {
  const { error } = await supabase.rpc('complete_event', { p_event_id: id });
  if (error) throw mapRpcError(error);
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_draft', { p_event_id: id });
  if (error) throw mapRpcError(error);
}
