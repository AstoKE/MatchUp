import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/**
 * Starts the 30-day deletion grace period and returns when the purge is due. The server requires a
 * password sign-in within the last 10 minutes (REAUTH_REQUIRED otherwise), so call it right after one.
 */
export async function requestAccountDeletion(): Promise<string> {
  const { data, error } = await supabase.rpc('request_account_deletion');
  if (error) throw mapRpcError(error);
  return z.string().check(z.minLength(1)).parse(data);
}

export async function cancelAccountDeletion(): Promise<void> {
  const { error } = await supabase.rpc('cancel_account_deletion');
  if (error) throw mapRpcError(error);
}

/** The caller's personal data as a JSON document (server-assembled; at most once per 24 h). */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw mapRpcError(error);
  return z.record(z.string(), z.unknown()).parse(data);
}
