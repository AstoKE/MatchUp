import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/**
 * The player card's invitation (Phase 9 / M2), apart from the rest of the organization calls so that the card does not
 * carry them: the organization screens are their own lazy chunk.
 */
export interface InvitableOrganization {
  id: string;
  name: string;
  /** Where the person already stands in it. */
  membership: 'ACTIVE' | 'INVITED' | 'REQUESTED' | null;
}

export async function fetchOrganizationsToInvite(userId: string): Promise<InvitableOrganization[]> {
  const { data, error } = await supabase.rpc('list_organizations_to_invite', { p_user: userId });
  if (error) throw mapRpcError(error);
  return z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        membership: z.nullable(z.enum(['ACTIVE', 'INVITED', 'REQUESTED'])),
      }),
    )
    .parse(data);
}

export async function inviteToOrganization(org: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('invite_to_organization', {
    p_org: org,
    p_user: userId,
  });
  if (error) throw mapRpcError(error);
  return z.string().parse(data);
}
