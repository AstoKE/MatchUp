import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { signOut, useSession, VerifyEmailBanner } from '@/features/auth';
import { localizedName, type Catalog } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Button, Screen, Text, useTheme } from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { ProgressSection } from '../components/ProgressSection';
import { WithProfile } from '../components/WithProfile';

/** The signed-in user's own profile (Phase 2). Others' view of it follows the visibility setting. */
export function ProfileScreen() {
  return <WithProfile>{(data) => <ProfileContent {...data} />}</WithProfile>;
}

function ProfileContent({ profile, catalog }: { profile: MyProfile; catalog: Catalog }) {
  const { t } = useTranslation(['profile', 'auth', 'common', 'nav']);
  const router = useRouter();
  const session = useSession();
  const { spacing, colors, radius } = useTheme();
  const locale = currentLocale();
  // After signing out, land on the guest home page rather than a sign-in prompt.
  const logout = useMutation({ mutationFn: signOut, onSuccess: () => router.replace('/') });

  const city = catalog.cities.find((c) => c.id === profile.cityId);
  const district = city?.districts.find((d) => d.id === profile.districtId);
  const location = [district, city]
    .filter((x) => x !== undefined)
    .map((x) => localizedName(x.names, locale))
    .join(', ');

  return (
    <Screen maxWidth={640}>
      <VerifyEmailBanner />
      <View style={{ gap: spacing[1] }}>
        <Text variant="headline" heading={1}>
          {profile.displayName}
        </Text>
        {session.status === 'authenticated' && session.email ? (
          <Text tone="secondary">{t('auth:signedInAs', { email: session.email })}</Text>
        ) : null}
        <Text tone="secondary">{location || t('profile:noLocation')}</Text>
      </View>

      <Text>{profile.bio ?? t('profile:noBio')}</Text>

      <ProgressSection profile={profile} catalog={catalog} />

      <View style={{ gap: spacing[3] }}>
        <Text variant="title" heading={2}>
          {t('profile:sports')}
        </Text>
        {profile.sports.length === 0 ? (
          <Text tone="secondary">{t('profile:noSports')}</Text>
        ) : (
          profile.sports.map((entry) => {
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
                  padding: spacing[3],
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.borderSubtle,
                  backgroundColor: colors.surfaceRaised,
                }}
              >
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
            );
          })
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Button label={t('profile:editProfile')} onPress={() => router.push('/edit-profile')} />
        <Button
          variant="secondary"
          label={t('profile:editSports')}
          onPress={() => router.push('/edit-sports')}
        />
        <Button
          variant="secondary"
          label={t('profile:openSettings')}
          onPress={() => router.push('/settings')}
        />
      </View>
      <Button
        label={t('auth:signOut')}
        variant="tertiary"
        loading={logout.isPending}
        loadingLabel={t('common:loading')}
        onPress={() => logout.mutate()}
      />
    </Screen>
  );
}
