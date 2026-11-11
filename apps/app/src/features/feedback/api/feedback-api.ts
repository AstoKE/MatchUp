import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/** ROADMAP P-22: a request, suggestion or complaint about the app. Only sent; nobody reads it back through the API. */
export const FEEDBACK_KINDS = ['REQUEST', 'SUGGESTION', 'COMPLAINT'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 2000;

export async function submitFeedback(input: {
  kind: FeedbackKind;
  body: string;
  /** A screen name, such as `settings` (the server accepts nothing else). */
  context: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_feedback', {
    p_kind: input.kind,
    p_body: input.body,
    ...(input.context ? { p_context: input.context } : {}),
  });
  if (error) throw mapRpcError(error);
  return z.uuid().parse(data);
}
