import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

/** A screen's way back and its one h1. Anything under the title (who, what state) goes in `children`. */
export function ScreenHeader({
  title,
  backLabel,
  onBack,
  children,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <IconButton icon="chevron-left" label={backLabel} onPress={onBack} />
      <View style={{ flex: 1 }}>
        <Text variant="headline" heading={1}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}
