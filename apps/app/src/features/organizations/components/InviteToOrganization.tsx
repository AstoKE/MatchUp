import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Sheet, Text, useTheme, useToast } from '@/ui';
import { i18n } from '@/lib/i18n';
import enInvite from '@/locales/en/organization-invite.json';
import trInvite from '@/locales/tr/organization-invite.json';
import { fetchOrganizationsToInvite, inviteToOrganization } from '../api/invite-api';

let copyAdded = false;
// Its copy travels with this lazy chunk, not with the first load or the organization screens' chunk.
function ensureInviteCopy() {
  if (copyAdded) return;
  i18n.addResourceBundle('tr', 'organizationInvite', trInvite, true, true);
  i18n.addResourceBundle('en', 'organizationInvite', enInvite, true, true);
  copyAdded = true;
}

/**
 * On a player card (Phase 9 / M2): invite this person to an organization the viewer runs. Nothing shows for someone who
 * runs none.
 */
export function InviteToOrganization({ userId, name }: { userId: string; name: string }) {
  ensureInviteCopy();
  const { t } = useTranslation(['organizationInvite', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const options = useQuery({
    queryKey: ['organizations', 'to-invite', userId],
    queryFn: () => fetchOrganizationsToInvite(userId),
  });
  const invite = useMutation({
    mutationFn: (org: string) => inviteToOrganization(org, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
  if (!options.data || options.data.length === 0) return null;

  return (
    <>
      <Button
        variant="secondary"
        label={t('organizationInvite:open')}
        onPress={() => setOpen(true)}
        fullWidth
      />
      <Sheet
        visible={open}
        title={t('organizationInvite:title', { name })}
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
          {invite.isError ? <Banner kind="danger" message={errorText(invite.error)} /> : null}
          {options.data.map((org) => (
            <View
              key={org.id}
              style={{
                gap: spacing[2],
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <Text variant="label" style={{ flexGrow: 1 }}>
                {org.name}
              </Text>
              {org.membership ? (
                <Text variant="caption" tone="secondary">
                  {t(`organizationInvite:state.${org.membership}`)}
                </Text>
              ) : (
                <Button
                  label={t('organizationInvite:send', { organization: org.name })}
                  disabled={invite.isPending}
                  onPress={() =>
                    void invite
                      .mutateAsync(org.id)
                      .then((state) =>
                        toast.show(
                          t(
                            state === 'ACTIVE'
                              ? 'organizationInvite:joined'
                              : 'organizationInvite:sent',
                            {
                              name,
                            },
                          ),
                          'success',
                        ),
                      )
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
