import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { i18n } from '@/lib/i18n';
import enInvite from '@/locales/en/business-invite.json';
import trInvite from '@/locales/tr/business-invite.json';
import { Banner, Button, Sheet, Text, useTheme, useToast } from '@/ui';
import { fetchBusinessesToInvite, inviteBusinessStaff } from '../api/invite-api';

let copyAdded = false;
// Its copy travels with this lazy chunk, not with the first load or the business screens' chunk.
function ensureInviteCopy() {
  if (copyAdded) return;
  i18n.addResourceBundle('tr', 'businessInvite', trInvite, true, true);
  i18n.addResourceBundle('en', 'businessInvite', enInvite, true, true);
  copyAdded = true;
}

/**
 * On a player card (Phase 10 / M4): the owner of an active business invites this person as staff. Nothing shows for
 * someone who owns no business.
 */
export function InviteToBusiness({ userId, name }: { userId: string; name: string }) {
  ensureInviteCopy();
  const { t } = useTranslation(['businessInvite', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const options = useQuery({
    queryKey: ['businesses', 'to-invite', userId],
    queryFn: () => fetchBusinessesToInvite(userId),
  });
  const invite = useMutation({
    mutationFn: (business: string) => inviteBusinessStaff(business, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['businesses'] }),
  });
  if (!options.data || options.data.length === 0) return null;
  return (
    <>
      <Button
        variant="secondary"
        label={t('businessInvite:open')}
        onPress={() => setOpen(true)}
        fullWidth
      />
      <Sheet
        visible={open}
        title={t('businessInvite:title', { name })}
        onClose={() => setOpen(false)}
        closeLabel={t('common:close')}
        footer={
          <Button
            variant="secondary"
            label={t('common:close')}
            onPress={() => setOpen(false)}
            fullWidth
          />
        }
      >
        <View style={{ gap: spacing[3] }}>
          <Text variant="caption" tone="secondary">
            {t('businessInvite:hint')}
          </Text>
          {invite.isError ? <Banner kind="danger" message={errorText(invite.error)} /> : null}
          {options.data.map((business) => (
            <View
              key={business.id}
              style={{
                gap: spacing[2],
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <Text variant="label" style={{ flexGrow: 1 }}>
                {business.name}
              </Text>
              {business.membership ? (
                <Text variant="caption" tone="secondary">
                  {t(`businessInvite:state.${business.membership}`)}
                </Text>
              ) : (
                <Button
                  label={t('businessInvite:send', { business: business.name })}
                  disabled={invite.isPending}
                  onPress={() =>
                    void invite
                      .mutateAsync(business.id)
                      .then(() => toast.show(t('businessInvite:sent', { name }), 'success'))
                      .catch(() => undefined)
                  }
                />
              )}
            </View>
          ))}
        </View>
      </Sheet>
    </>
  );
}
