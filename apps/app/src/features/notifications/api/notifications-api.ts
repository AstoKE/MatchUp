import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

const NOTIFICATION_TYPES = [
  'JOIN_REQUESTED',
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'REQUEST_WAITLISTED',
  'PARTICIPANT_REMOVED',
  'PARTICIPANT_CANCELED',
  'SPOT_OPENED',
  'EVENT_CANCELED',
  'EVENT_CHANGED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const row = z.object({
  id: z.uuid(),
  type: z.string(),
  // The payload carries ids and template keys only (SECURITY §6), never names or free text.
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  read_at: z.nullable(z.string()),
});

export interface AppNotification {
  id: string;
  /** Null for a type this app version does not know yet (shown generically, never dropped). */
  type: NotificationType | null;
  eventId: string | null;
  createdAt: string;
  read: boolean;
  /** The event's title, when the viewer may still see the event. */
  eventTitle: string | null;
}

const isType = (value: string): value is NotificationType =>
  (NOTIFICATION_TYPES as readonly string[]).includes(value);

/** The latest 50, newest first (RLS: own rows only), with the titles of the events they are about. */
export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw mapRpcError(error);
  const rows = z.array(row).parse(data);
  const eventIds = [
    ...new Set(
      rows.flatMap((r) => (typeof r.payload.event_id === 'string' ? [r.payload.event_id] : [])),
    ),
  ];
  const titles = new Map<string, string>();
  if (eventIds.length > 0) {
    const events = await supabase.from('events').select('id, title').in('id', eventIds);
    if (events.error) throw mapRpcError(events.error);
    for (const e of events.data ?? []) titles.set(e.id, e.title);
  }
  return rows.map((r) => {
    const eventId = typeof r.payload.event_id === 'string' ? r.payload.event_id : null;
    return {
      id: r.id,
      type: isType(r.type) ? r.type : null,
      eventId,
      createdAt: r.created_at,
      read: r.read_at !== null,
      eventTitle: eventId ? (titles.get(eventId) ?? null) : null,
    };
  });
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw mapRpcError(error);
  return count ?? 0;
}

/** Marks the given notifications read, or all of the caller's when `ids` is omitted. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? undefined });
  if (error) throw mapRpcError(error);
}
