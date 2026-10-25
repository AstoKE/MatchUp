import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The icons the app ships, drawn in-house on a 24 px grid (docs/design.md §7): outline = 1.75 px
 * stroke with rounded joins; filled = solid shape whose inner details are holes (even-odd), so the
 * glyph reads on any surface without a second color. Inline SVG instead of an icon font keeps the
 * bundle to what we use (docs/PERFORMANCE.md).
 */
export type IconName = 'compass' | 'calendar' | 'add-circle' | 'person';

const STROKE = 1.75;

type Glyph = (color: string) => ReactElement;

const outline: Record<IconName, Glyph> = {
  compass: (c) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={STROKE} fill="none" />
      <Path
        d="M15.5 8.5l-2.1 4.9-4.9 2.1 2.1-4.9z"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
  calendar: (c) => (
    <>
      <Rect
        x={3.5}
        y={5}
        width={17}
        height={15.5}
        rx={2.5}
        stroke={c}
        strokeWidth={STROKE}
        fill="none"
      />
      <Path d="M3.5 10h17M8 3v4M16 3v4" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  ),
  'add-circle': (c) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={STROKE} fill="none" />
      <Path d="M12 8v8M8 12h8" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  ),
  person: (c) => (
    <>
      <Circle cx={12} cy={8} r={3.75} stroke={c} strokeWidth={STROKE} fill="none" />
      <Path
        d="M4.75 20.25c0-3.9 3.25-6.5 7.25-6.5s7.25 2.6 7.25 6.5"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
};

const filled: Record<IconName, Glyph> = {
  compass: (c) => (
    <Path
      fillRule="evenodd"
      fill={c}
      d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 1 0 0-19.5zM15.5 8.5l-4.9 2.1-2.1 4.9 4.9-2.1z"
    />
  ),
  calendar: (c) => (
    <>
      <Path
        fillRule="evenodd"
        fill={c}
        d="M5.75 4.25h12.5a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5.75a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3zM6 11h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
      />
      <Path d="M8 2.5v3.5M16 2.5v3.5" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  ),
  'add-circle': (c) => (
    <Path
      fillRule="evenodd"
      fill={c}
      d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM11.1 7.25h1.8v3.85h3.85v1.8h-3.85v3.85h-1.8v-3.85H7.25v-1.8h3.85z"
    />
  ),
  person: (c) => (
    <>
      <Circle cx={12} cy={8} r={4.5} fill={c} />
      <Path
        fill={c}
        d="M4 20.25c0-4.3 3.6-7.25 8-7.25s8 2.95 8 7.25a.75.75 0 0 1-.75.75H4.75a.75.75 0 0 1-.75-.75z"
      />
    </>
  ),
};

/** Decorative icon: always hidden from assistive tech; the surrounding control carries the name. */
export function Icon({
  name,
  color,
  size = 24,
  variant = 'outline',
}: {
  name: IconName;
  color: string;
  size?: number;
  variant?: 'outline' | 'filled';
}) {
  const glyph = (variant === 'filled' ? filled : outline)[name];
  return (
    <View
      testID={`icon-${name}-${variant}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {glyph(color)}
      </Svg>
    </View>
  );
}
