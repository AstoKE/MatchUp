import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '@/lib/i18n';
import { Button, Text, useTheme } from '@/ui';

/** A bordered group on the page. */
export function Panel({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing[2],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      {children}
    </View>
  );
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));
}

/** One decision button that asks once more before it runs: nothing here is undone by a second tap. */
export function Confirmed({
  label,
  variant = 'secondary',
  disabled = false,
  pending = false,
  onConfirm,
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('admin');
  const { spacing } = useTheme();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant={variant} label={label} disabled={disabled} onPress={() => setAsking(true)} />
    );
  }
  return (
    <View
      role="group"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2] }}
    >
      <Text role="alert" variant="label">
        {t('reports.sure')}
      </Text>
      <Button
        variant={variant}
        label={t('reports.yes')}
        loading={pending}
        onPress={() => {
          onConfirm();
          setAsking(false);
        }}
      />
      <Button variant="tertiary" label={t('reports.no')} onPress={() => setAsking(false)} />
    </View>
  );
}
