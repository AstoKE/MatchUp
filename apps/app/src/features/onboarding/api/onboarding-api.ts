import { mapRpcError, type AvatarKey, type Gender, type OnboardingInput } from '@matchup/domain';
import * as z from 'zod/mini';
import { supabase } from '@/lib/supabase/client';
import { nullableArg } from '@/lib/supabase/rpc-args';

const accountRow = z.object({
  user_id: z.uuid(),
  account_status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED']),
  email_verified: z.boolean(),
  is_admin: z.boolean(),
  adult_confirmed: z.boolean(),
  onboarded: z.boolean(),
  legal_consent_current: z.boolean(),
  deletion_due_at: z.nullable(z.string()),
  // Phase 8 (ADR-0029); optional: an older server does not send them.
  phone_verified: z.optional(z.boolean()),
  phone_required: z.optional(z.boolean()),
});

export interface MyAccount {
  userId: string;
  status: z.infer<typeof accountRow>['account_status'];
  emailVerified: boolean;
  /** UX only: the administration screens use it to show or hide themselves. The server decides every call. */
  isAdmin: boolean;
  adultConfirmed: boolean;
  onboarded: boolean;
  /** False after new Terms/Privacy versions were published and not yet accepted (re-consent gate). */
  legalConsentCurrent: boolean;
  /** ISO time the account will be purged while a deletion request is pending; otherwise null. */
  deletionDueAt: string | null;
  /** A confirmed Turkish mobile number is on the account (ADR-0029). */
  phoneVerified: boolean;
  /** The server requires one for writes (`phone.required`); the app's gate follows it. */
  phoneRequired: boolean;
}

/** Server-authoritative account state (the client never decides who is onboarded). */
export async function fetchMyAccount(): Promise<MyAccount> {
  const { data, error } = await supabase.rpc('get_my_account');
  if (error) throw mapRpcError(error);
  const row = z.array(accountRow).check(z.minLength(1)).parse(data)[0]!;
  return {
    userId: row.user_id,
    status: row.account_status,
    emailVerified: row.email_verified,
    isAdmin: row.is_admin,
    adultConfirmed: row.adult_confirmed,
    onboarded: row.onboarded,
    legalConsentCurrent: row.legal_consent_current,
    deletionDueAt: row.deletion_due_at,
    phoneVerified: row.phone_verified ?? false,
    phoneRequired: row.phone_required ?? false,
  };
}

export interface LegalVersions {
  termsVersion: string;
  privacyVersion: string;
  /** True while the legal text is a draft awaiting counsel review. */
  draft: boolean;
}

/** The consent versions the server will accept (public config). */
export async function fetchLegalVersions(): Promise<LegalVersions> {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', ['legal.terms_version', 'legal.privacy_version', 'legal.draft']);
  if (error) throw error;
  const byKey = new Map(
    z
      .array(z.object({ key: z.string(), value: z.unknown() }))
      .parse(data)
      .map((r) => [r.key, r.value]),
  );
  return {
    termsVersion: z.string().check(z.minLength(1)).parse(byKey.get('legal.terms_version')),
    privacyVersion: z.string().check(z.minLength(1)).parse(byKey.get('legal.privacy_version')),
    // Absent means "not a draft"; the server only ever sets this to true while texts are unreviewed.
    draft: z.catch(z.boolean(), false).parse(byKey.get('legal.draft')),
  };
}

export async function completeOnboarding(
  input: OnboardingInput,
  versions: Pick<LegalVersions, 'termsVersion' | 'privacyVersion'>,
): Promise<void> {
  const { error } = await supabase.rpc('complete_onboarding', {
    p_adult_confirmed: input.adultConfirmed,
    p_terms_version: versions.termsVersion,
    p_privacy_version: versions.privacyVersion,
    p_marketing_consent: input.marketingConsent,
    p_display_name: input.displayName,
    p_city_id: nullableArg(input.cityId),
    p_district_id: nullableArg(input.districtId),
    p_sports: input.sports.map((s) => ({
      sport_id: s.sportId,
      level: s.level,
      position_ids: s.positionIds,
    })),
  });
  if (error) throw mapRpcError(error);
}

/**
 * Right after onboarding (Phase 8 / M3): the private gender and the drawing it gives. complete_onboarding keeps its
 * signature for installed apps, so this is a second call; if it fails, the person keeps the initials and can choose later.
 */
export async function saveGenderAndAvatar(gender: Gender, avatarKey: AvatarKey): Promise<void> {
  const gendered = await supabase.rpc('set_my_gender', { p_gender: gender });
  if (gendered.error) throw mapRpcError(gendered.error);
  const drawn = await supabase.rpc('set_my_avatar', { p_avatar_key: avatarKey });
  if (drawn.error) throw mapRpcError(drawn.error);
}

/** Re-consent for already-onboarded users; the versions must be the ones the user was shown. */
export async function acceptCurrentLegalTerms(
  versions: Pick<LegalVersions, 'termsVersion' | 'privacyVersion'>,
): Promise<void> {
  const { error } = await supabase.rpc('accept_current_legal_terms', {
    p_terms_version: versions.termsVersion,
    p_privacy_version: versions.privacyVersion,
  });
  if (error) throw mapRpcError(error);
}
