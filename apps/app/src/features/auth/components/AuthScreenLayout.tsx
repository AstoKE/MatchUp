import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '@/features/settings';
import { Screen, ScreenHeader, Text } from '@/ui';

/**
 * Shared frame for the account screens: a way out, one h1, narrow centered column. The account screens sit
 * outside the tab bar, so without the back button a guest who tapped a protected tab was stuck here. The
 * provisional logo is not shown: its square white background looks wrong on the dark theme (founder's request).
 */
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
  const router = useRouter();
  return (
    <Screen maxWidth={480}>
      <ScreenHeader
        title={title}
        backLabel={t('back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      {children}
      <LanguagePicker />
    </Screen>
  );
}
