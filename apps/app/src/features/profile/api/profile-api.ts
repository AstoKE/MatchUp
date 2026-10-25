import {
  isSkillLevel,
  mapRpcError,
  PROFILE_VISIBILITIES,
  THEME_PREFERENCES,
  type ProfileEditInput,
  type ProfileVisibility,
  type SportSelection,
  type ThemePreference,
} from '@matchup/domain';
import { SUPPORTED_LOCALES, type Locale } from '@matchup/config';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';
import { nullableArg } from '@/lib/supabase/rpc-args';

export interface MySettings {
  locale: Locale;
  theme: ThemePreference;
  profileVisibility: ProfileVisibility;
  showReliability: boolean;
  showBadges: boolean;
  marketingConsent: boolean;
}

export interface MyProfile {
  userId: string;
  displayName: string;
  bio: string | null;
  cityId: string | null;
  districtId: string | null;
  settings: MySettings;
  sports: SportSelection[];
}

const profileRow = z.object({
  display_name: z.string().nullable(),
  bio: z.string().nullable(),
  city_id: z.uuid().nullable(),
  district_id: z.uuid().nullable(),
});
const settingsRow = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  theme: z.enum(THEME_PREFERENCES),
  profile_visibility: z.enum(PROFILE_VISIBILITIES),
  show_reliability: z.boolean(),
  show_badges: z.boolean(),
  marketing_consent_at: z.string().nullable(),
});
const sportRow = z.object({ sport_id: z.uuid(), self_assessed_level: z.number() });
const positionRow = z.object({ sport_id: z.uuid(), position_id: z.uuid() });

/** The caller's own profile, settings and sport profiles (RLS limits every query to their own rows). */
export async function fetchMyProfile(userId: string): Promise<MyProfile> {
  const [profile, settings, sports, positions] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, bio, city_id, district_id')
      .eq('id', userId)
      .single(),
    supabase
      .from('user_settings')
      .select(
        'locale, theme, profile_visibility, show_reliability, show_badges, marketing_consent_at',
      )
      .eq('user_id', userId)
      .single(),
    supabase
      .from('user_sport_profiles')
      .select('sport_id, self_assessed_level')
      .eq('user_id', userId),
    supabase.from('user_sport_positions').select('sport_id, position_id').eq('user_id', userId),
  ]);
  for (const result of [profile, settings, sports, positions]) {
    if (result.error) throw result.error;
  }

  const p = profileRow.parse(profile.data);
  const s = settingsRow.parse(settings.data);
  const positionRows = z.array(positionRow).parse(positions.data);

  return {
    userId,
    displayName: p.display_name ?? '',
    bio: p.bio,
    cityId: p.city_id,
    districtId: p.district_id,
    settings: {
      locale: s.locale,
      theme: s.theme,
      profileVisibility: s.profile_visibility,
      showReliability: s.show_reliability,
      showBadges: s.show_badges,
      marketingConsent: s.marketing_consent_at !== null,
    },
    sports: z
      .array(sportRow)
      .parse(sports.data)
      .flatMap((row) =>
        isSkillLevel(row.self_assessed_level)
          ? [
              {
                sportId: row.sport_id,
                level: row.self_assessed_level,
                positionIds: positionRows
                  .filter((position) => position.sport_id === row.sport_id)
                  .map((position) => position.position_id),
              },
            ]
          : [],
      ),
  };
}

export async function updateMyProfile(input: ProfileEditInput): Promise<void> {
  const { error } = await supabase.rpc('update_my_profile', {
    p_display_name: input.displayName,
    p_bio: nullableArg(input.bio),
    p_city_id: nullableArg(input.cityId),
    p_district_id: nullableArg(input.districtId),
  });
  if (error) throw mapRpcError(error);
}

export type SettingsUpdate = Omit<MySettings, 'marketingConsent'>;

export async function updateMySettings(settings: SettingsUpdate): Promise<void> {
  const { error } = await supabase.rpc('update_my_settings', {
    p_locale: settings.locale,
    p_theme: settings.theme,
    p_profile_visibility: settings.profileVisibility,
    p_show_reliability: settings.showReliability,
    p_show_badges: settings.showBadges,
  });
  if (error) throw mapRpcError(error);
}

export async function setMarketingConsent(granted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_marketing_consent', { p_granted: granted });
  if (error) throw mapRpcError(error);
}

export async function replaceSportProfiles(sports: readonly SportSelection[]): Promise<void> {
  const { error } = await supabase.rpc('replace_my_sport_profiles', {
    p_sports: sports.map((s) => ({
      sport_id: s.sportId,
      level: s.level,
      position_ids: s.positionIds,
    })),
  });
  if (error) throw mapRpcError(error);
}
