import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

const localized = z.object({ tr: z.string(), en: z.string() });

const progressRow = z.object({
  reliability_score: z.number(),
  reliability_samples: z.number(),
  reliability_confidence: z.number(),
  xp_total: z.number(),
});
const ratingRow = z.object({
  sport_id: z.uuid(),
  rating: z.number(),
  confidence: z.number(),
});
const badgeRow = z.object({
  code: z.string(),
  sport_id: z.nullable(z.uuid()),
  awarded_at: z.string(),
});
const definitionRow = z.object({ code: z.string(), names: localized, descriptions: localized });

export interface MyProgress {
  xpTotal: number;
  /** Null until the first finalized event: nothing is known yet. */
  reliability: { score: number; samples: number; confidence: number } | null;
  ratings: { sportId: string; rating: number; confidence: number }[];
  badges: {
    code: string;
    sportId: string | null;
    names: { tr: string; en: string };
    descriptions: { tr: string; en: string };
  }[];
}

/** The caller's own progress: RLS limits these tables to their own rows, a revoked badge is not shown. */
export async function fetchMyProgress(userId: string): Promise<MyProgress> {
  const [progress, ratings, badges, definitions] = await Promise.all([
    supabase
      .from('user_progress')
      .select('reliability_score, reliability_samples, reliability_confidence, xp_total')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_sport_ratings')
      .select('sport_id, rating, confidence')
      .eq('user_id', userId),
    supabase
      .from('user_achievements')
      .select('code, sport_id, awarded_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('awarded_at', { ascending: false }),
    supabase.from('achievement_definitions').select('code, names, descriptions'),
  ]);
  const failed = progress.error ?? ratings.error ?? badges.error ?? definitions.error;
  if (failed) throw mapRpcError(failed);

  const row = progress.data ? progressRow.parse(progress.data) : null;
  const catalog = new Map(
    z
      .array(definitionRow)
      .parse(definitions.data)
      .map((d) => [d.code, d]),
  );
  return {
    xpTotal: row?.xp_total ?? 0,
    reliability: row
      ? {
          score: row.reliability_score,
          samples: row.reliability_samples,
          confidence: row.reliability_confidence,
        }
      : null,
    ratings: z
      .array(ratingRow)
      .parse(ratings.data)
      .map((r) => ({ sportId: r.sport_id, rating: r.rating, confidence: r.confidence })),
    badges: z
      .array(badgeRow)
      .parse(badges.data)
      .flatMap((b) => {
        const definition = catalog.get(b.code);
        return definition
          ? [
              {
                code: b.code,
                sportId: b.sport_id,
                names: definition.names,
                descriptions: definition.descriptions,
              },
            ]
          : [];
      }),
  };
}
