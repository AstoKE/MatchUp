import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/** The player card's staff invitation (Phase 10 / M4), apart from the business screens' calls (their own lazy chunk). */
export interface InvitableBusiness {
  id: string;
  name: string;
  membership: 'ACTIVE' | 'INVITED' | null;
}

export async function fetchBusinessesToInvite(userId: string): Promise<InvitableBusiness[]> {
  const { data, error } = await supabase.rpc('list_businesses_to_invite', { p_user: userId });
  if (error) throw mapRpcError(error);
  return z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        membership: z.nullable(z.enum(['ACTIVE', 'INVITED'])),
      }),
    )
    .parse(data);
}

export async function inviteBusinessStaff(business: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('invite_business_staff', {
    p_business: business,
    p_user: userId,
  });
  if (error) throw mapRpcError(error);
  return z.string().parse(data);
}
