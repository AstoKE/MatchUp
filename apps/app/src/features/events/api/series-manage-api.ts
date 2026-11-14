import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

// The organizer's side of a series (ADR-0032). Only the lazy series panel imports this module, so none of it is in
// the first load (docs/PERFORMANCE.md §4 item 5).

const mySeriesRow = z.object({
  id: z.uuid(),
  status: z.enum(['ACTIVE', 'STOPPED']),
  upcoming: z.array(z.object({ id: z.uuid(), starts_at: z.string() })),
});

/** Organizer only: the published events of a series that have not started yet, soonest first. */
export async function fetchSeriesUpcoming(
  seriesId: string,
): Promise<{ id: string; startsAt: string }[]> {
  const { data, error } = await supabase.rpc('list_my_event_series');
  if (error) throw mapRpcError(error);
  const series = z
    .array(mySeriesRow)
    .parse(data)
    .find((s) => s.id === seriesId);
  return series?.upcoming.map((e) => ({ id: e.id, startsAt: e.starts_at })) ?? [];
}

export async function createEventSeries(eventId: string, intervalWeeks: 1 | 2): Promise<string> {
  const { data, error } = await supabase.rpc('create_event_series', {
    p_event_id: eventId,
    p_interval_weeks: intervalWeeks,
  });
  if (error) throw mapRpcError(error);
  return z.uuid().parse(data);
}

export async function stopEventSeries(seriesId: string): Promise<void> {
  const { error } = await supabase.rpc('stop_event_series', { p_series_id: seriesId });
  if (error) throw mapRpcError(error);
}
