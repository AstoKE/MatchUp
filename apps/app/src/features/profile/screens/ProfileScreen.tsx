import { useMutation } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { signOut, useSession, VerifyEmailBanner } from '@/features/auth';
import { localizedName, type Catalog } from '@/features/catalog';
import { useMyAccount } from '@/features/onboarding';
import { currentLocale } from '@/lib/i18n';
import { Button, Icon, Screen, SportDot, Text, useTheme } from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { ProgressSection } from '../components/ProgressSection';
import { MyAvatar } from '../components/UserAvatar';
import { WithProfile } from '../components/WithProfile';

/** The signed-in user's own profile (Phase 2). Others' view of it follows the visibility setting. */
export function ProfileScreen() {
  return <WithProfile>{(data) => <ProfileContent {...data} />}</WithProfile>;
}

/** One line of the account list: where it goes, and an arrow. */
function AccountRow({
  label,
  onPress,
  disabled = false,
  first = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  first?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing[3],
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[2],
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.borderSubtle,
        opacity: pressed || disabled ? 0.7 : 1,
        ...(focused
          ? {
              outlineColor: colors.focusRing,
              outlineWidth: 2,
              outlineOffset: -2,
              outlineStyle: 'solid' as const,
            }
          : null),
      })}
    >
      <Text variant="titleSm" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <Icon name="chevron-left" color={colors.textSecondary} size={18} />
      </View>
    </Pressable>
  );
}

function ProfileContent({ profile, catalog }: { profile: MyProfile; catalog: Catalog }) {
  const { t } = useTranslation(['profile', 'auth', 'common', 'nav', 'notifications']);
  const router = useRouter();
  const session = useSession();
  // The console exists on the web only, and only an administrator is shown the way in (the server decides every call).
  const account = useMyAccount();
  const showAdmin = Platform.OS === 'web' && account.data?.isAdmin === true;
  const { spacing, colors, radius } = useTheme();
  const locale = currentLocale();
  // After signing out, land on the guest home page rather than a sign-in prompt.
  // The navigation follows the promise, not the mutation's onSuccess: signing out re-renders this protected screen into
  // a redirect at once, and a callback of an unmounted screen may not run (seen 2026-11-09 with newer supabase-js).
  const logout = useMutation({ mutationFn: signOut });
  const signOutHome = () =>
    void logout
      .mutateAsync()
      .then(() => router.replace('/'))
      .catch(() => undefined);

  const city = catalog.cities.find((c) => c.id === profile.cityId);
  const district = city?.districts.find((d) => d.id === profile.districtId);
  const location = [district, city]
    .filter((x) => x !== undefined)
    .map((x) => localizedName(x.names, locale))
    .join(', ');

  return (
    <Screen maxWidth={640}>
      <VerifyEmailBanner />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <MyAvatar size={96} />
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Text variant="headline" heading={1}>
            {profile.displayName}
          </Text>
          {session.status === 'authenticated' && session.email ? (
            <Text variant="bodySm" tone="secondary">
              {t('auth:signedInAs', { email: session.email })}
            </Text>
          ) : null}
          <Text variant="bodySm" tone="secondary">
            {location || t('profile:noLocation')}
          </Text>
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              variant="tertiary"
              label={t('profile:avatar.change')}
              onPress={() => router.push('/avatar')}
            />
          </View>
        </View>
      </View>

      <Button
        variant="secondary"
        label={t('profile:editProfile')}
        onPress={() => router.push('/edit-profile')}
        fullWidth
      />

      <Text>{profile.bio ?? t('profile:noBio')}</Text>

      <View style={{ gap: spacing[2] }}>
        <Text variant="title" heading={2}>
          {t('profile:sports')}
        </Text>
        {profile.sports.length === 0 ? (
          <Text tone="secondary">{t('profile:noSports')}</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {profile.sports.map((entry) => {
              const sport = catalog.sports.find((s) => s.id === entry.sportId);
              if (!sport) return null;
              const positions = sport.positions
                .filter((p) => entry.positionIds.includes(p.id))
                .map((p) => localizedName(p.names, locale))
                .join(', ');
              return (
                <View
                  key={entry.sportId}
                  accessible
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing[2],
                    minHeight: 44,
                    paddingHorizontal: spacing[3],
                    paddingVertical: spacing[1],
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.borderSubtle,
                    backgroundColor: colors.surfaceRaised,
                  }}
                >
                  <SportDot slug={sport.slug} />
                  <View style={{ flexShrink: 1 }}>
                    <Text variant="label">
                      {localizedName(sport.names, locale)} ·{' '}
                      {t('profile:levelValue', { value: entry.level })}
                    </Text>
                    {positions ? (
                      <Text variant="caption" tone="secondary">
                        {positions}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <ProgressSection profile={profile} catalog={catalog} />

      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          backgroundColor: colors.surfaceRaised,
          overflow: 'hidden',
        }}
      >
        <AccountRow
          first
          label={t('profile:editSports')}
          onPress={() => router.push('/edit-sports')}
        />
        <AccountRow
          label={t('notifications:title')}
          onPress={() => router.push('/notifications')}
        />
        <AccountRow label={t('profile:openSettings')} onPress={() => router.push('/settings')} />
        {showAdmin ? (
          <AccountRow
            label={t('profile:openAdmin')}
            onPress={() => router.push('/admin' as Href)}
          />
        ) : null}
        <AccountRow label={t('auth:signOut')} disabled={logout.isPending} onPress={signOutHome} />
      </View>
    </Screen>
  );
}
