import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, SegmentedChoice, Text, useTheme } from '@/ui';
import { fetchRunnableOrganizations, setEventOrganization } from '../api/event-link-api';

/**
 * Event management (Phase 9 / M3): show the event under an organization the organizer runs, or under nobody. Nothing
 * shows for someone who runs none. The server checks again.
 */
export function EventOrganizationControl({
  eventId,
  currentId,
}: {
  eventId: string;
  currentId: string | null;
}) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const queryClient = useQueryClient();
  const runnable = useQuery({
    queryKey: ['organizations', 'runnable'],
    queryFn: fetchRunnableOrganizations,
  });
  const link = useMutation({
    mutationFn: (org: string | null) => setEventOrganization(eventId, org),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
  });
  const options = runnable.data ?? [];
  if (options.length === 0) return null;
  return (
    <View style={{ gap: spacing[2] }}>
      {link.isError ? <Banner kind="danger" message={errorText(link.error)} /> : null}
      <SegmentedChoice<string>
        label={t('organization.label')}
        value={currentId ?? ''}
        onChange={(value) => link.mutate(value === '' ? null : value)}
        options={[
          { value: '', label: t('organization.none') },
          ...options.map((o) => ({ value: o.id, label: o.name })),
        ]}
      />
      <Text variant="caption" tone="secondary">
        {t('organization.hint')}
      </Text>
    </View>
  );
}
