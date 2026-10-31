import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

const ATTENDANCE = ['NOT_CONFIRMED', 'PRESENT', 'ABSENT', 'DISPUTED'] as const;
export type Attendance = (typeof ATTENDANCE)[number];

const attendanceRow = z.object({
  finalized_at: z.nullable(z.string()),
  dispute_closes_at: z.nullable(z.string()),
  review_window_closes_at: z.nullable(z.string()),
  my: z.nullable(
    z.object({
      participation_id: z.uuid(),
      attendance: z.enum(ATTENDANCE),
      is_organizer: z.boolean(),
    }),
  ),
  roster: z.nullable(
    z.array(
      z.object({
        participation_id: z.uuid(),
        display_name: z.nullable(z.string()),
        attendance: z.enum(ATTENDANCE),
        is_organizer: z.boolean(),
      }),
    ),
  ),
});

export interface EventAttendance {
  finalizedAt: string | null;
  disputeClosesAt: string | null;
  /** The viewer's own row; null for an organizer who does not play. */
  my: { participationId: string; attendance: Attendance; isOrganizer: boolean } | null;
  /** Organizer only. */
  roster:
    | {
        participationId: string;
        displayName: string | null;
        attendance: Attendance;
        isOrganizer: boolean;
      }[]
    | null;
}

/** The organizer gets every approved player, an approved player only their own row, anyone else NOT_FOUND. */
export async function fetchEventAttendance(eventId: string): Promise<EventAttendance> {
  const { data, error } = await supabase.rpc('get_event_attendance', { p_event_id: eventId });
  if (error) throw mapRpcError(error);
  const row = attendanceRow.parse(data);
  return {
    finalizedAt: row.finalized_at,
    disputeClosesAt: row.dispute_closes_at,
    my: row.my
      ? {
          participationId: row.my.participation_id,
          attendance: row.my.attendance,
          isOrganizer: row.my.is_organizer,
        }
      : null,
    roster: row.roster
      ? row.roster.map((p) => ({
          participationId: p.participation_id,
          displayName: p.display_name,
          attendance: p.attendance,
          isOrganizer: p.is_organizer,
        }))
      : null,
  };
}

export async function markAttendance(args: {
  participationId: string;
  value: 'PRESENT' | 'ABSENT';
}): Promise<void> {
  const { error } = await supabase.rpc('mark_attendance', {
    p_participation_id: args.participationId,
    p_value: args.value,
  });
  if (error) throw mapRpcError(error);
}

export async function finalizeAttendance(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('finalize_attendance', { p_event_id: eventId });
  if (error) throw mapRpcError(error);
}

export async function disputeAttendance(args: {
  participationId: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('dispute_attendance', {
    p_participation_id: args.participationId,
    p_reason: args.reason,
  });
  if (error) throw mapRpcError(error);
}
