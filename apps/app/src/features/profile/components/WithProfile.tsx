import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCatalog, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { EmptyState, Screen, useTheme } from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { useMyProfile } from '../hooks';

/**
 * Loads the profile and the catalog once and renders the screen only when both are ready, with an
 * honest loading state and a retryable error state (offline, server problem).
 */
export function WithProfile({
  children,
}: {
  children: (data: { profile: MyProfile; catalog: Catalog }) => ReactNode;
}) {
  const { t } = useTranslation(['profile', 'common']);
  const { colors } = useTheme();
  const profile = useMyProfile();
  const catalog = useCatalog();

  if (profile.isPending || catalog.isPending) {
    return (
      <Screen>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  const error = profile.error ?? catalog.error;
  if (error || !profile.data || !catalog.data) {
    return (
      <Screen>
        <EmptyState
          title={t('profile:loadFailed')}
          body={errorText(error)}
          actionLabel={t('common:retry')}
          onAction={() => {
            void profile.refetch();
            void catalog.refetch();
          }}
        />
      </Screen>
    );
  }
  return <>{children({ profile: profile.data, catalog: catalog.data })}</>;
}
