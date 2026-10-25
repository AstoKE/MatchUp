import { mapRpcError, type OnboardingInput } from '@matchup/domain';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';
import { nullableArg } from '@/lib/supabase/rpc-args';

const accountRow = z.object({
  user_id: z.uuid(),
  account_status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED']),
  email_verified: z.boolean(),
  is_admin: z.boolean(),
  adult_confirmed: z.boolean(),
  onboarded: z.boolean(),
});

export interface MyAccount {
  userId: string;
  status: z.infer<typeof accountRow>['account_status'];
  emailVerified: boolean;
  adultConfirmed: boolean;
  onboarded: boolean;
}

/** Server-authoritative account state (the client never decides who is onboarded). */
export async function fetchMyAccount(): Promise<MyAccount> {
  const { data, error } = await supabase.rpc('get_my_account');
  if (error) throw mapRpcError(error);
  const row = z.array(accountRow).min(1).parse(data)[0]!;
  return {
    userId: row.user_id,
    status: row.account_status,
    emailVerified: row.email_verified,
    adultConfirmed: row.adult_confirmed,
    onboarded: row.onboarded,
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
    termsVersion: z.string().min(1).parse(byKey.get('legal.terms_version')),
    privacyVersion: z.string().min(1).parse(byKey.get('legal.privacy_version')),
    // Absent means "not a draft"; the server only ever sets this to true while texts are unreviewed.
    draft: z.boolean().catch(false).parse(byKey.get('legal.draft')),
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
