import { mapRpcError, VENUE_KINDS, type VenueKind } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';

/**
 * Everything the console asks of the server (docs/DATABASE.md §9). The pages are only a view: every one of these
 * functions checks for an administrator with a second factor in the database, so a hand-made call fares no better.
 */

// ---- the second factor -----------------------------------------------------------------------------------------------
export interface AdminSecurity {
  /** The token already says aal2. */
  secondFactorDone: boolean;
  /** A verified authenticator exists, so the next step is to answer it and not to set one up. */
  factorId: string | null;
}

export async function fetchAdminSecurity(): Promise<AdminSecurity> {
  const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.error) throw level.error;
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  return {
    secondFactorDone: level.data.currentLevel === 'aal2',
    factorId: factors.data.totp[0]?.id ?? null,
  };
}

export interface TotpEnrollment {
  factorId: string;
  /** An SVG as a data URI, drawn from the same secret. */
  qrCode: string;
  /** For typing into an authenticator by hand. */
  secret: string;
}

/** A half-finished enrollment is removed first: a second one with the same name would be refused. */
export async function enrollTotp(): Promise<TotpEnrollment> {
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) throw listed.error;
  for (const factor of listed.data.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const made = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  if (made.error) throw made.error;
  return { factorId: made.data.id, qrCode: made.data.totp.qr_code, secret: made.data.totp.secret };
}

/** Answers the authenticator; on success the session carries aal2. A wrong code throws. */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const done = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (done.error) throw done.error;
}

// ---- reports ---------------------------------------------------------------------------------------------------------
const reportItem = z.object({
  id: z.uuid(),
  target_type: z.enum(['USER', 'EVENT', 'VENUE']),
  target_id: z.uuid(),
  target_label: z.nullable(z.string()),
  reason: z.string(),
  status: z.enum(['OPEN', 'ACTIONED', 'DISMISSED']),
  created_at: z.string(),
  handled_at: z.nullable(z.string()),
  reporter_id: z.uuid(),
  reporter_name: z.nullable(z.string()),
  open_for_target: z.number(),
});
const historyEntry = z.object({
  id: z.number(),
  action: z.string(),
  outcome: z.nullable(z.string()),
  note: z.nullable(z.string()),
  created_at: z.string(),
});
const reportDetailRow = z.extend(reportItem, {
  details: z.nullable(z.string()),
  target: z.nullable(
    z.object({
      id: z.uuid(),
      name: z.nullable(z.string()),
      account_status: z.optional(z.string()),
      status: z.optional(z.string()),
      starts_at: z.optional(z.string()),
      organizer_id: z.optional(z.uuid()),
      organizer_name: z.optional(z.nullable(z.string())),
      approved_count: z.optional(z.number()),
      capacity: z.optional(z.number()),
      is_admin: z.optional(z.boolean()),
      listing_status: z.optional(z.enum(['ACTIVE', 'HIDDEN'])),
      verified: z.optional(z.boolean()),
    }),
  ),
  others: z.array(
    z.object({
      id: z.uuid(),
      reason: z.string(),
      details: z.nullable(z.string()),
      created_at: z.string(),
      reporter_name: z.nullable(z.string()),
    }),
  ),
  history: z.array(historyEntry),
});
const reportPage = z.object({
  items: z.array(reportItem),
  next_cursor: z.nullable(z.object({ created_at: z.string(), id: z.uuid() })),
});

export type ReportItem = z.infer<typeof reportItem>;
export type ReportDetail = z.infer<typeof reportDetailRow>;
export type HistoryEntry = z.infer<typeof historyEntry>;
export type ReportCursor = { created_at: string; id: string };

async function call<T>(
  name: Parameters<typeof supabase.rpc>[0],
  args: Record<string, unknown> | undefined,
  parse: (data: unknown) => T,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw mapRpcError(error);
  return parse(data);
}

export function fetchReports(status: 'OPEN' | 'CLOSED', cursor: ReportCursor | null) {
  return call(
    'admin_list_reports',
    { p_status: status, ...(cursor ? { p_cursor: cursor } : null) },
    (data) => reportPage.parse(data),
  );
}
export const fetchReport = (id: string) =>
  call('admin_get_report', { p_report_id: id }, (data) => reportDetailRow.parse(data));

export const resolveReport = (id: string, outcome: 'ACTIONED' | 'DISMISSED', note: string) =>
  call(
    'admin_resolve_report',
    { p_report_id: id, p_outcome: outcome, ...(note.trim() ? { p_note: note } : null) },
    () => undefined,
  );

// ---- people, events, reviews ------------------------------------------------------------------------------------------
export const suspendUser = (id: string, note: string) =>
  call('admin_suspend_user', { p_user_id: id, p_note: note }, () => undefined);
export const reinstateUser = (id: string, note: string) =>
  call('admin_reinstate_user', { p_user_id: id, p_note: note }, () => undefined);
export const cancelEvent = (id: string, note: string) =>
  call('admin_cancel_event', { p_event_id: id, p_note: note }, () => undefined);
export const hideReview = (id: string, note: string) =>
  call('admin_hide_review', { p_review_id: id, p_note: note }, () => undefined);
export const restoreReview = (id: string, note: string) =>
  call('admin_restore_review', { p_review_id: id, p_note: note }, () => undefined);

const userRow = z.object({
  id: z.uuid(),
  name: z.nullable(z.string()),
  bio: z.nullable(z.string()),
  // Phase 8 / M3 (optional: an older server does not send them).
  avatar_key: z.optional(z.nullable(z.string())),
  avatar_path: z.optional(z.nullable(z.string())),
  account_status: z.string(),
  created_at: z.string(),
  is_admin: z.boolean(),
  events_organized: z.number(),
  events_joined: z.number(),
  reports_open: z.number(),
  reports_total: z.number(),
  no_shows_30d: z.number(),
  blocked_by: z.number(),
  history: z.array(historyEntry),
});
export type AdminUser = z.infer<typeof userRow>;
export const fetchUser = (id: string) =>
  call('admin_get_user', { p_user_id: id }, (data) => userRow.parse(data));

const found = z.array(
  z.object({ id: z.uuid(), name: z.nullable(z.string()), account_status: z.string() }),
);
export type FoundUser = z.infer<typeof found>[number];
export const searchUsers = (query: string) =>
  call('admin_search_users', { p_query: query }, (data) => found.parse(data));

const reviewRow = z.array(
  z.object({
    id: z.uuid(),
    event_id: z.uuid(),
    event_title: z.string(),
    reviewer_id: z.uuid(),
    reviewer_name: z.nullable(z.string()),
    reviewee_id: z.uuid(),
    reviewee_name: z.nullable(z.string()),
    skill_score: z.number(),
    fair_play: z.boolean(),
    status: z.enum(['ACTIVE', 'HIDDEN']),
    created_at: z.string(),
  }),
);
export type AdminReview = z.infer<typeof reviewRow>[number];
export const fetchReviews = (userId: string, as: 'reviewer' | 'reviewee') =>
  call(
    'admin_list_reviews',
    as === 'reviewer' ? { p_reviewer: userId } : { p_reviewee: userId },
    (data) => reviewRow.parse(data),
  );

// ---- queues ------------------------------------------------------------------------------------------------------------
const flagRow = z.array(
  z.object({
    kind: z.enum(['MUTUAL_FIVE', 'REVIEW_BOMBING', 'NO_SHOWS']),
    count: z.number(),
    total: z.optional(z.number()),
    subjects: z.array(z.object({ id: z.uuid(), name: z.nullable(z.string()) })),
  }),
);
export type Flag = z.infer<typeof flagRow>[number];
export const fetchFlags = () => call('admin_list_flags', undefined, (data) => flagRow.parse(data));

const disputeRow = z.array(
  z.object({
    participation_id: z.uuid(),
    event_id: z.uuid(),
    event_title: z.string(),
    user_id: z.uuid(),
    user_name: z.nullable(z.string()),
    reason: z.nullable(z.string()),
    created_at: z.string(),
    finalized_at: z.nullable(z.string()),
  }),
);
export type Dispute = z.infer<typeof disputeRow>[number];
export const fetchDisputes = () =>
  call('admin_list_disputes', undefined, (data) => disputeRow.parse(data));
export async function resolveDispute(participationId: string, present: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_resolve_attendance_dispute', {
    p_participation_id: participationId,
    p_resolution: present ? 'PRESENT' : 'ABSENT',
  });
  if (error) throw mapRpcError(error);
}

const actionPage = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      actor_id: z.uuid(),
      actor_name: z.nullable(z.string()),
      action: z.string(),
      target_type: z.string(),
      target_id: z.uuid(),
      report_id: z.nullable(z.uuid()),
      outcome: z.nullable(z.string()),
      note: z.nullable(z.string()),
      created_at: z.string(),
    }),
  ),
  next_cursor: z.nullable(z.object({ id: z.number() })),
});
export type AdminAction = z.infer<typeof actionPage>['items'][number];
export const fetchActions = (cursor: { id: number } | null) =>
  call('admin_list_actions', cursor ? { p_cursor: cursor } : {}, (data) => actionPage.parse(data));

// ---- venues (Phase 4) ------------------------------------------------------------------------------------------------
const venuePage = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.enum(VENUE_KINDS),
      city_id: z.uuid(),
      district_id: z.uuid(),
      address_text: z.nullable(z.string()),
      point: z.object({ lat: z.number(), lon: z.number() }),
      verified: z.boolean(),
      sport_ids: z.array(z.uuid()),
      provenance: z.string(),
      hidden: z.boolean(),
      created_at: z.string(),
      submitted_by: z.nullable(z.uuid()),
      submitter_name: z.nullable(z.string()),
      open_reports: z.number(),
      events: z.number(),
    }),
  ),
  next_cursor: z.nullable(z.object({ created_at: z.string(), id: z.uuid() })),
});
export type AdminVenue = z.infer<typeof venuePage>['items'][number];
export type VenueStatus = 'UNVERIFIED' | 'VERIFIED' | 'HIDDEN';
export type VenueCursor = { created_at: string; id: string };

export const fetchVenues = (status: VenueStatus, cursor: VenueCursor | null) =>
  call(
    'admin_list_venues',
    { p_status: status, ...(cursor ? { p_cursor: cursor } : null) },
    (data) => venuePage.parse(data),
  );

export const setVenueStatus = (id: string, action: 'VERIFY' | 'HIDE' | 'RESTORE', note?: string) =>
  call(
    'admin_set_venue_status',
    { p_venue_id: id, p_action: action, ...(note?.trim() ? { p_note: note.trim() } : null) },
    (data) => z.boolean().parse(data),
  );

export interface NewVenue {
  kind: VenueKind;
  name: string;
  cityId: string;
  districtId: string;
  point: { lat: number; lon: number };
  addressText: string;
  sportIds: string[];
  sourceRef: string;
}

export const addVenue = (v: NewVenue) =>
  call(
    'admin_add_venue',
    {
      p_input: {
        kind: v.kind,
        name: v.name,
        city_id: v.cityId,
        district_id: v.districtId,
        point: v.point,
        address_text: v.addressText.trim() || null,
        sport_ids: v.sportIds,
      },
      ...(v.sourceRef.trim() ? { p_source_ref: v.sourceRef.trim() } : null),
    },
    (data) => z.uuid().parse(data),
  );

// ---- pilot metrics (Phase 7 / M4) ------------------------------------------------------------------------------------
const count = z.number();
const rate = z.nullable(z.number());
const pilotMetrics = z.object({
  days: z.number(),
  players: z.object({
    onboarded: count,
    new: count,
    organized: count,
    joined: count,
    analytics_consent: count,
  }),
  events: z.object({
    published: count,
    upcoming: count,
    canceled: count,
    completed: count,
    fill_rate: rate,
  }),
  participation: z.object({ requests: count, approved: count, no_show_rate: rate }),
  provinces: z.array(z.object({ city_id: z.uuid(), name: z.string(), upcoming: count })),
  provinces_active: count,
  usage: z.record(z.string(), count),
  daily: z.array(
    z.object({ day: z.string(), new_players: count, published: count, requests: count }),
  ),
});
export type PilotMetrics = z.infer<typeof pilotMetrics>;
export const fetchPilotMetrics = (days: number) =>
  call('admin_pilot_metrics', { p_days: days }, (data) => pilotMetrics.parse(data));

// ---- feedback (ROADMAP P-22) -------------------------------------------------------------------------------------------
export const FEEDBACK_STATUSES = ['NEW', 'SEEN', 'DONE'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
const feedbackRow = z.array(
  z.object({
    id: z.uuid(),
    kind: z.enum(['REQUEST', 'SUGGESTION', 'COMPLAINT']),
    body: z.string(),
    context: z.nullable(z.string()),
    status: z.enum(FEEDBACK_STATUSES),
    user_id: z.uuid(),
    user_name: z.nullable(z.string()),
    created_at: z.string(),
    handled_at: z.nullable(z.string()),
  }),
);
export type FeedbackItem = z.infer<typeof feedbackRow>[number];
/** Without a status: everything not done yet (new and seen), newest first. */
export const fetchFeedback = (status: FeedbackStatus | null) =>
  call('admin_list_feedback', status ? { p_status: status } : {}, (data) =>
    feedbackRow.parse(data),
  );
export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const { error } = await supabase.rpc('admin_set_feedback_status', { p_id: id, p_status: status });
  if (error) throw mapRpcError(error);
}
