import { brand } from '@matchup/config';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '@/lib/i18n';
import { EmptyState, Screen, Text, useTheme } from '@/ui';

const logo = require('../../assets/brand/logo-provisional-512.png') as number;

/** Discover — public (guest-accessible, D-09). The event list arrives with the Event Engine (Phase 3). */
export default function Discover() {
  const { t } = useTranslation(['common', 'nav']);
  const { spacing } = useTheme();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Image
          source={logo}
          accessibilityLabel={t('common:logoAlt')}
          style={{ width: 56, height: 56 }}
        />
        <View style={{ flexShrink: 1 }}>
          <Text variant="headline" heading={1}>
            {t('nav:discover')}
          </Text>
          <Text tone="secondary">{brand.taglines[currentLocale()]}</Text>
        </View>
      </View>
      <EmptyState title={t('common:emptyDiscoverTitle')} body={t('common:emptyDiscoverBody')} />
    </Screen>
  );
}
