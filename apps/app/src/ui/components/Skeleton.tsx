import { useEffect, useState } from 'react';
import { Animated, type DimensionValue } from 'react-native';
import { useReducedMotion, useTheme } from '../theme';

/** Loading placeholder. Pulses unless the user prefers reduced motion; hidden from assistive tech. */
export function Skeleton({
  width = '100%',
  height = 16,
  radiusKey = 'sm',
}: {
  width?: DimensionValue;
  height?: number;
  radiusKey?: 'sm' | 'md' | 'lg' | 'pill';
}) {
  const { colors, radius, motion } = useTheme();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduced) {
      opacity.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: motion.slow * 3,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: motion.slow * 3, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, opacity, motion.slow]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width,
        height,
        borderRadius: radius[radiusKey],
        backgroundColor: colors.borderSubtle,
        opacity,
      }}
    />
  );
}
