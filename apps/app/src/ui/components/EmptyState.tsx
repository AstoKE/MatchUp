import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

/** Honest empty / error state: says what is (not) there and offers a next step. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  media,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  media?: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing[3], paddingVertical: spacing[8] }}>
      {media}
      <Text variant="title" heading={2} style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text tone="secondary" style={{ textAlign: 'center', maxWidth: 480 }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}
