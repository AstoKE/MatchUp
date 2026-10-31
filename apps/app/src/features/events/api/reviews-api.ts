import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

const reviewsRow = z.object({
  can_review: z.boolean(),
  window_open: z.boolean(),
  window_closes_at: z.nullable(z.string()),
  targets: z.array(
    z.object({
      user_id: z.uuid(),
      display_name: z.nullable(z.string()),
      reviewed: z.boolean(),
    }),
  ),
});

export interface EventReviews {
  canReview: boolean;
  windowOpen: boolean;
  windowClosesAt: string | null;
  targets: { userId: string; displayName: string | null; reviewed: boolean }[];
}

/** Who the viewer may review; never anyone's score. NOT_FOUND for people outside the event. */
export async function fetchEventReviews(eventId: string): Promise<EventReviews> {
  const { data, error } = await supabase.rpc('get_event_reviews', { p_event_id: eventId });
  if (error) throw mapRpcError(error);
  const row = reviewsRow.parse(data);
  return {
    canReview: row.can_review,
    windowOpen: row.window_open,
    windowClosesAt: row.window_closes_at,
    targets: row.targets.map((t) => ({
      userId: t.user_id,
      displayName: t.display_name,
      reviewed: t.reviewed,
    })),
  };
}

export interface ReviewInput {
  revieweeId: string;
  score: number;
  fairPlay: boolean;
}

/** All or nothing on the server: one ineligible or duplicate entry rejects the whole submission. */
export async function submitReviews(args: {
  eventId: string;
  reviews: readonly ReviewInput[];
}): Promise<void> {
  const { error } = await supabase.rpc('submit_reviews', {
    p_event_id: args.eventId,
    p_reviews: args.reviews.map((r) => ({
      reviewee_id: r.revieweeId,
      skill_score: r.score,
      fair_play: r.fairPlay,
    })),
  });
  if (error) throw mapRpcError(error);
}
