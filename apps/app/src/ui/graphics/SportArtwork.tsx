import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { SPORT_TINTS, SportIcon } from './SportIcon';

/**
 * Stands in for a venue photo (docs/design.md §7): no event has one yet (venues are Phase 4). A soft gradient of the
 * sport's tint with its icon, drawn in-house. Decorative: the sport's name is always in the text beside it.
 */
export function SportArtwork({
  slug,
  size,
  width,
  height,
  iconSize,
  square = false,
}: {
  slug: string | undefined;
  /** A square thumbnail. */
  size?: number;
  /** Or free dimensions; a number or a share of the parent. */
  width?: number | `${number}%`;
  height?: number;
  iconSize?: number;
  /** No rounded corners (edge to edge). */
  square?: boolean;
}) {
  const { colors, radius } = useTheme();
  const id = useId();
  const tint = (slug && SPORT_TINTS[slug]) || colors.borderStrong;
  const boxHeight = size ?? height ?? 60;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size ?? width ?? '100%',
        height: boxHeight,
        borderRadius: square ? 0 : radius.md,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={0.7} />
            <Stop offset="1" stopColor={tint} stopOpacity={0.15} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <SportIcon
        slug={slug}
        color={colors.textPrimary}
        size={iconSize ?? Math.round(boxHeight / 2)}
      />
    </View>
  );
}
