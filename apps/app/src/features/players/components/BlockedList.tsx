import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Button, EmptyState, Skeleton, Text, useTheme, useToast } from '@/ui';
import { useMyBlocks, useUnblockUser } from '../hooks';

/** Settings › the people I blocked, with a way back (USER_FLOWS FL-9). */
export function BlockedList() {
  const { t } = useTranslation(['players', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const blocks = useMyBlocks();
  const unblock = useUnblockUser();

  if (blocks.isPending) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
        <Skeleton height={48} radiusKey="md" />
      </View>
    );
  }
  if (blocks.isError) {
    return (
      <EmptyState
        title={t('players:blocked.loadFailed')}
        body={errorText(blocks.error)}
        actionLabel={t('common:retry')}
        onAction={() => void blocks.refetch()}
      />
    );
  }
  if (blocks.data.length === 0) {
    return <Text tone="secondary">{t('players:blocked.empty')}</Text>;
  }
  return (
    <View role="list" style={{ gap: spacing[2] }}>
      {blocks.data.map((person) => {
        const name = person.displayName ?? t('players:unnamed');
        return (
          <View
            key={person.userId}
            role="listitem"
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing[2],
            }}
          >
            <Text style={{ flexShrink: 1 }}>{name}</Text>
            <Button
              variant="secondary"
              label={t('players:blocked.unblock')}
              accessibilityLabel={t('players:blocked.unblockNamed', { name })}
              disabled={unblock.isPending}
              onPress={() =>
                unblock.mutate(person.userId, {
                  onSuccess: () => toast.show(t('players:blocked.unblocked'), 'success'),
                  onError: (failure) => toast.show(errorText(failure), 'danger'),
                })
              }
            />
          </View>
        );
      })}
    </View>
  );
}
