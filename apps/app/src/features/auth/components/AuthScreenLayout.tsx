import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '@/features/settings';
import { CourtDrawing, Screen, ScreenHeader, sportColors, Text, useTheme } from '@/ui';

/**
 * Shared frame for the account screens: a way out, one h1, narrow centered column. The account screens sit
 * outside the tab bar, so without the back button a guest who tapped a protected tab was stuck here. The
 * provisional logo is not shown: its square white background looks wrong on the dark theme (founder's request).
 */
export function AuthScreenLayout({
  title,
  subtitle,
  court = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** The welcome band of the sign-in page (docs/design.md §13). */
  court?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { radius, spacing } = useTheme();
  const football = sportColors.football;
  return (
    <Screen maxWidth={480}>
      <ScreenHeader
        title={title}
        backLabel={t('back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      {court && football ? (
        <View
          style={{
            height: 112,
            padding: spacing[2],
            borderRadius: radius.xl,
            backgroundColor: football.court,
          }}
        >
          <CourtDrawing slug="football" color={football.on} />
        </View>
      ) : null}
      {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      {children}
      <LanguagePicker />
    </Screen>
  );
}
