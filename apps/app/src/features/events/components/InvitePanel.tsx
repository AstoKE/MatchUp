import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { env } from '@/lib/env';
import { shareLink } from '@/lib/share-link';
import { Button, Text, useTheme, useToast } from '@/ui';

/** The link that opens an invite-only event: anybody who holds it can see the event and ask to join. */
export function inviteLink(eventId: string, token: string): string {
  const base = env.EXPO_PUBLIC_WEB_URL.replace(/\/+$/, '');
  return `${base}/e/${eventId}?invite=${encodeURIComponent(token)}`;
}

/**
 * Organizer only: the invite link of an invite-only event, to copy or share. The token is the event's
 * only protection (SECURITY S-18), so the page says what the link allows and that it is for the people
 * the organizer chooses.
 */
export function InvitePanel({ eventId, token }: { eventId: string; token: string }) {
  const { t } = useTranslation('events');
  const { colors, radius, spacing } = useTheme();
  const toast = useToast();
  const link = inviteLink(eventId, token);
  return (
    <View
      style={{
        gap: spacing[3],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="title" heading={2}>
        {t('invite.title')}
      </Text>
      <Text tone="secondary">{t('invite.body')}</Text>
      <Text variant="bodySm" selectable accessibilityLabel={t('invite.linkLabel')}>
        {link}
      </Text>
      <Button
        variant="secondary"
        label={t('invite.share')}
        onPress={() => {
          void shareLink(link).then((result) => {
            if (result === 'copied') toast.show(t('invite.copied'), 'success');
            else if (result === 'failed') toast.show(t('invite.failed'), 'danger');
          });
        }}
        fullWidth
      />
    </View>
  );
}
