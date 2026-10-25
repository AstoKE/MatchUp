import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '@/features/settings';
import { Screen, Text, useTheme } from '@/ui';

const logo = require('../../../../assets/brand/logo-provisional-512.png') as number;

/** Shared frame for the account screens: logo, one h1, narrow centered column. */
export function AuthScreenLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation('common');
  const { spacing } = useTheme();
  return (
    <Screen maxWidth={480}>
      <View style={{ gap: spacing[3] }}>
        <Image source={logo} accessibilityLabel={t('logoAlt')} style={{ width: 56, height: 56 }} />
        <Text variant="headline" heading={1}>
          {title}
        </Text>
        {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      </View>
      {children}
      <LanguagePicker />
    </Screen>
  );
}
