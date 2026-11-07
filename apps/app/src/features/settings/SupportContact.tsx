import { brand } from '@matchup/config';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text, useTheme } from '@/ui';

/**
 * How to reach a person: the support address from the brand config. Until the founder sets it, a
 * placeholder says it is coming (production builds refuse to start without it, app.config.ts).
 */
export function SupportContact({ align = 'start' }: { align?: 'start' | 'center' }) {
  const { t } = useTranslation('common');
  const { spacing } = useTheme();
  const email = brand.contact.supportEmail;
  const center = align === 'center';
  return (
    <View style={{ gap: spacing[2], alignItems: center ? 'center' : 'flex-start' }}>
      <Text tone="secondary" style={center ? { textAlign: 'center' } : undefined}>
        {email ? t('support.body') : t('support.pending')}
      </Text>
      {email ? (
        <Button
          variant="secondary"
          label={email}
          accessibilityHint={t('support.emailHint')}
          onPress={() => void Linking.openURL(`mailto:${email}`)}
        />
      ) : null}
    </View>
  );
}
