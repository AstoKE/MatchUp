import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/** Phase 8 / M4 (ADR-0028): the two push consents, the "asked once" mark, devices and the test message. */
export interface PushSettings {
  recommendations: boolean;
  reminders: boolean;
  /** The popup has been answered (either way); it is never shown again for this account. */
  prompted: boolean;
}

const settingsRow = z.object({
  push_recommendations_at: z.nullable(z.string()),
  push_reminders_at: z.nullable(z.string()),
  push_prompted_at: z.nullable(z.string()),
});

export async function fetchPushSettings(userId: string): Promise<PushSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('push_recommendations_at, push_reminders_at, push_prompted_at')
    .eq('user_id', userId)
    .single();
  if (error) throw mapRpcError(error);
  const row = settingsRow.parse(data);
  return {
    recommendations: row.push_recommendations_at !== null,
    reminders: row.push_reminders_at !== null,
    prompted: row.push_prompted_at !== null,
  };
}

export async function setPushConsents(choice: {
  recommendations: boolean;
  reminders: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('set_push_consents', {
    p_recommendations: choice.recommendations,
    p_reminders: choice.reminders,
  });
  if (error) throw mapRpcError(error);
}

export async function registerPushDevice(
  token: string,
  platform: 'ios' | 'android',
): Promise<void> {
  const { error } = await supabase.rpc('register_push_device', {
    p_token: token,
    p_platform: platform,
  });
  if (error) throw mapRpcError(error);
}

export async function unregisterPushDevice(token: string): Promise<void> {
  const { error } = await supabase.rpc('unregister_push_device', { p_token: token });
  if (error) throw mapRpcError(error);
}

/** False when the person has no registered device yet (nothing to send to). */
export async function sendTestPush(): Promise<boolean> {
  const { data, error } = await supabase.rpc('send_test_push');
  if (error) throw mapRpcError(error);
  return z.boolean().parse(data);
}
