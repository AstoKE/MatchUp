import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

export const SERIES_STOP_REASONS = [
  'BY_ORGANIZER',
  'ORGANIZER_UNAVAILABLE',
  'DETAILS_INVALID',
] as const;
export type SeriesStopReason = (typeof SERIES_STOP_REASONS)[number];

const seriesRow = z.object({
  id: z.uuid(),
  interval_weeks: z.number(),
  status: z.enum(['ACTIVE', 'STOPPED']),
  is_mine: z.boolean(),
  stopped_reason: z.nullable(z.enum(SERIES_STOP_REASONS)),
  next_at: z.nullable(z.string()),
  // Phase 11 / M2, optional for a hosted database without that migration.
  weekday: z.optional(z.nullable(z.number())),
  local_time: z.optional(z.nullable(z.string())),
});

/** The series an event belongs to (ADR-0032). Why it stopped and the next start are the organizer's only. */
export interface EventSeries {
  id: string;
  intervalWeeks: 1 | 2;
  status: 'ACTIVE' | 'STOPPED';
  isMine: boolean;
  stoppedReason: SeriesStopReason | null;
  /** The next start not opened yet; it opens two weeks before. */
  nextAt: string | null;
  /** When an active series repeats, in Turkey's local time: ISO weekday (1 = Monday) and "HH:MM". */
  slot: { weekday: number; time: string } | null;
}

export async function fetchEventSeries(eventId: string): Promise<EventSeries | null> {
  const { data, error } = await supabase.rpc('get_event_series', { p_event_id: eventId });
  if (error) throw mapRpcError(error);
  const row = z.nullable(seriesRow).parse(data ?? null);
  if (!row) return null;
  return {
    id: row.id,
    intervalWeeks: row.interval_weeks === 2 ? 2 : 1,
    status: row.status,
    isMine: row.is_mine,
    stoppedReason: row.stopped_reason,
    nextAt: row.next_at,
    slot:
      typeof row.weekday === 'number' &&
      Number.isInteger(row.weekday) &&
      row.weekday >= 1 &&
      row.weekday <= 7 &&
      typeof row.local_time === 'string' &&
      /^\d{2}:\d{2}$/.test(row.local_time)
        ? { weekday: row.weekday, time: row.local_time }
        : null,
  };
}
