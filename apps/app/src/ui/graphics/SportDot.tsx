import { View } from 'react-native';
import { useTheme } from '../theme';
import { sportColors } from '../tokens';

/** The sport's color as a small dot beside its name, which carries the meaning. */
export function SportDot({ slug, size = 14 }: { slug: string | undefined; size?: number }) {
  const { colors, radius } = useTheme();
  return (
    <View
      testID={`sport-dot-${slug ?? 'unknown'}`}
      accessibilityElementsHidden
      importantForAccessibility="no"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: (slug && sportColors[slug]?.court) || colors.borderStrong,
      }}
    />
  );
}
