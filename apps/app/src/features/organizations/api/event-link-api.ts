import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/**
 * Phase 9 / M3: linking an event to an organization the organizer runs. Apart from the organization screens' calls, so
 * the event management screen does not carry them.
 */
export interface RunnableOrganization {
  id: string;
  name: string;
}

/** Active organizations the caller owns or administers. */
export async function fetchRunnableOrganizations(): Promise<RunnableOrganization[]> {
  const { data, error } = await supabase.rpc('list_my_organizations');
  if (error) throw mapRpcError(error);
  const page = z
    .object({
      items: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          status: z.string(),
          role: z.string(),
          membership: z.optional(z.nullable(z.string())),
        }),
      ),
    })
    .parse(data);
  return page.items
    .filter(
      (o) =>
        o.status === 'ACTIVE' &&
        (o.role === 'OWNER' || o.role === 'ADMIN') &&
        (o.membership ?? 'ACTIVE') === 'ACTIVE',
    )
    .map((o) => ({ id: o.id, name: o.name }));
}

/** Null unlinks. */
export async function setEventOrganization(eventId: string, org: string | null): Promise<void> {
  const { error } = await supabase.rpc(
    'set_event_organization',
    org ? { p_event_id: eventId, p_org: org } : { p_event_id: eventId },
  );
  if (error) throw mapRpcError(error);
}
