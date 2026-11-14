import { EVENT_STATUSES, mapRpcError, type MyEventBucket } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';
import { itemRow, toListItem, type EventListItem, type SearchCursor } from './search-api';

const MY_STATUSES = [
  'ORGANIZER',
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'WAITLISTED',
  'CANCELED',
  'REMOVED',
] as const;
export type MyStatus = (typeof MY_STATUSES)[number];

const myRow = z.object({
  ...itemRow.shape,
  status: z.enum(EVENT_STATUSES),
  my_status: z.nullable(z.enum(MY_STATUSES)),
  pending_count: z.nullable(z.number()),
  // Phase 11 / M2, optional for a hosted database without that migration.
  in_series: z.optional(z.boolean()),
});
const pageRow = z.object({
  items: z.array(myRow),
  next_cursor: z.nullable(z.object({ starts_at: z.string(), id: z.string() })),
});

/** A Discover-style row plus where the caller stands: lifecycle status, own role/request, pending count. */
export interface MyEventItem extends EventListItem {
  status: (typeof EVENT_STATUSES)[number];
  myStatus: MyStatus | null;
  /** Organizer only: open join requests awaiting a decision. */
  pendingCount: number | null;
  /** The event belongs to a series (ADR-0032). */
  inSeries: boolean;
}
export interface MyEventsPage {
  items: MyEventItem[];
  nextCursor: SearchCursor | null;
}

export async function fetchMyEvents(
  bucket: MyEventBucket,
  cursor: SearchCursor | null,
): Promise<MyEventsPage> {
  const { data, error } = await supabase.rpc('list_my_events', {
    p_bucket: bucket,
    p_cursor: cursor ?? undefined,
  });
  if (error) throw mapRpcError(error);
  const page = pageRow.parse(data);
  return {
    items: page.items.map((row) => ({
      ...toListItem(row),
      status: row.status,
      myStatus: row.my_status,
      pendingCount: row.pending_count,
      inSeries: row.in_series ?? false,
    })),
    nextCursor: page.next_cursor,
  };
}
