import { mapRpcError } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

const localized = z.object({ tr: z.string(), en: z.string() });

const cardRow = z.object({
  user_id: z.uuid(),
  display_name: z.nullable(z.string()),
  bio: z.nullable(z.string()),
  // Phase 8 / M3 (optional: an older server does not send them).
  avatar_key: z.optional(z.nullable(z.string())),
  avatar_path: z.optional(z.nullable(z.string())),
  is_me: z.boolean(),
  sports: z.array(
    z.object({ sport_id: z.uuid(), level: z.number(), rating: z.nullable(z.number()) }),
  ),
  reliability: z.nullable(z.number()),
  xp_total: z.nullable(z.number()),
  badges: z.array(
    z.object({
      code: z.string(),
      sport_id: z.nullable(z.uuid()),
      names: localized,
      descriptions: localized,
    }),
  ),
});

export interface PlayerCard {
  userId: string;
  displayName: string | null;
  bio: string | null;
  avatarKey: string | null;
  /** A photo the viewer may or may not be allowed to see; the storage policy decides when it is signed. */
  avatarPath: string | null;
  isMe: boolean;
  sports: { sportId: string; level: number; rating: number | null }[];
  /** Null below three signals or when the player hides it. */
  reliability: number | null;
  /** Null when the player hides badges. */
  xpTotal: number | null;
  badges: {
    code: string;
    sportId: string | null;
    names: { tr: string; en: string };
    descriptions: { tr: string; en: string };
  }[];
}

/** NOT_FOUND unless the viewer may see this person; a block looks the same as someone who does not exist. */
export async function fetchPlayerCard(userId: string): Promise<PlayerCard> {
  const { data, error } = await supabase.rpc('get_player_card', { p_user_id: userId });
  if (error) throw mapRpcError(error);
  const row = cardRow.parse(data);
  return {
    userId: row.user_id,
    displayName: row.display_name,
    bio: row.bio,
    avatarKey: row.avatar_key ?? null,
    avatarPath: row.avatar_path ?? null,
    isMe: row.is_me,
    sports: row.sports.map((s) => ({ sportId: s.sport_id, level: s.level, rating: s.rating })),
    reliability: row.reliability,
    xpTotal: row.xp_total,
    badges: row.badges.map((b) => ({
      code: b.code,
      sportId: b.sport_id,
      names: b.names,
      descriptions: b.descriptions,
    })),
  };
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId });
  if (error) throw mapRpcError(error);
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_user_id: userId });
  if (error) throw mapRpcError(error);
}

const blockRow = z.object({ user_id: z.uuid(), display_name: z.nullable(z.string()) });

export interface BlockedPerson {
  userId: string;
  displayName: string | null;
}

export async function fetchMyBlocks(): Promise<BlockedPerson[]> {
  const { data, error } = await supabase.rpc('list_my_blocks');
  if (error) throw mapRpcError(error);
  return z
    .array(blockRow)
    .parse(data)
    .map((b) => ({ userId: b.user_id, displayName: b.display_name }));
}

export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'UNSAFE',
  'FAKE_EVENT',
  'INAPPROPRIATE',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export async function sendReport(args: {
  targetType: 'USER' | 'EVENT' | 'ORGANIZATION';
  targetId: string;
  reason: ReportReason;
  details: string | null;
  inviteToken: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('report', {
    p_target_type: args.targetType,
    p_target_id: args.targetId,
    p_reason: args.reason,
    p_details: args.details ?? undefined,
    p_invite_token: args.inviteToken ?? undefined,
  });
  if (error) throw mapRpcError(error);
}
