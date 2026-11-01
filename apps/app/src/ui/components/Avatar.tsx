import { View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * A round mark with the person's initials. Decorative: the name is always written beside it. Turkish case rules apply
 * whatever the app language, because the names are Turkish (i → İ).
 */
export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const { colors, radius } = useTheme();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr'))
    .join('');
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceOverlay,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
      }}
    >
      <Text variant="title">{initials}</Text>
    </View>
  );
}
