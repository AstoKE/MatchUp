import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

const JOIN_RESULTS = ['REQUESTED', 'APPROVED', 'WAITLISTED'] as const;
const PARTICIPATION_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'WAITLISTED',
  'CANCELED',
  'REMOVED',
] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

const ownRow = z.object({
  status: z.enum(PARTICIPATION_STATUSES),
  request_count: z.number(),
  is_organizer: z.boolean(),
});

/** The signed-in user's own request on one event, or null (guests and people who never asked). */
export async function fetchMyParticipation(
  eventId: string,
): Promise<{ status: ParticipationStatus; requestCount: number; isOrganizer: boolean } | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('event_participations')
    .select('status, request_count, is_organizer')
    .eq('event_id', eventId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw mapRpcError(error);
  if (!data) return null;
  const row = ownRow.parse(data);
  return { status: row.status, requestCount: row.request_count, isOrganizer: row.is_organizer };
}

/** The server decides: REQUESTED, APPROVED (auto-approve events) or WAITLISTED (full). Idempotent. */
export async function requestJoin(args: {
  eventId: string;
  message: string | null;
  positionId: string | null;
  /** The secret of an invite-only event (from the shared link); ignored for public events. */
  inviteToken?: string | null;
}): Promise<(typeof JOIN_RESULTS)[number]> {
  const { data, error } = await supabase.rpc('request_join', {
    p_event_id: args.eventId,
    p_message: args.message ?? undefined,
    p_position_id: args.positionId ?? undefined,
    p_invite_token: args.inviteToken ?? undefined,
  });
  if (error) throw mapRpcError(error);
  return z.enum(JOIN_RESULTS).parse(data);
}

export async function cancelParticipation(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_participation', { p_event_id: eventId });
  if (error) throw mapRpcError(error);
}

export type OrganizerDecision = 'approve' | 'reject' | 'waitlist' | 'remove';

export async function decideParticipation(args: {
  participationId: string;
  decision: OrganizerDecision;
}): Promise<void> {
  const id = args.participationId;
  const { error } =
    args.decision === 'approve'
      ? await supabase.rpc('approve_participation', { p_participation_id: id })
      : args.decision === 'reject'
        ? await supabase.rpc('reject_participation', { p_participation_id: id })
        : args.decision === 'waitlist'
          ? await supabase.rpc('waitlist_participation', { p_participation_id: id })
          : await supabase.rpc('remove_participant', { p_participation_id: id });
  if (error) throw mapRpcError(error);
}

const requestRow = z.object({
  id: z.uuid(),
  status: z.enum(['REQUESTED', 'WAITLISTED', 'APPROVED']),
  display_name: z.nullable(z.string()),
  level: z.nullable(z.number()),
  message: z.nullable(z.string()),
  position_id: z.nullable(z.uuid()),
  requested_at: z.string(),
  request_count: z.number(),
});

export interface EventRequest {
  id: string;
  status: 'REQUESTED' | 'WAITLISTED' | 'APPROVED';
  displayName: string | null;
  /** Self-assessed level for the event's sport, when the player gave one. */
  level: number | null;
  message: string | null;
  requestedAt: string;
  requestCount: number;
}

/** Organizer only: open requests (oldest first), then the waitlist (FIFO), then approved players. */
export async function fetchEventRequests(eventId: string): Promise<EventRequest[]> {
  const { data, error } = await supabase.rpc('list_event_requests', { p_event_id: eventId });
  if (error) throw mapRpcError(error);
  const page = z.object({ items: z.array(requestRow) }).parse(data);
  return page.items.map((row) => ({
    id: row.id,
    status: row.status,
    displayName: row.display_name,
    level: row.level,
    message: row.message,
    requestedAt: row.requested_at,
    requestCount: row.request_count,
  }));
}
