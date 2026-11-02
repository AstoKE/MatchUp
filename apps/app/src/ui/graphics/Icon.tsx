import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The icons the app ships, drawn in-house on a 24 px grid (docs/design.md §7): 1.75 px stroke
 * with rounded joins. Inline SVG instead of an icon font keeps the
 * bundle to what we use (docs/PERFORMANCE.md).
 */
export type IconName =
  | 'compass'
  | 'calendar'
  | 'plus'
  | 'person'
  | 'chevron-left'
  | 'check'
  | 'clock'
  | 'alert'
  | 'star'
  | 'trophy'
  | 'heart'
  | 'list';

const STROKE = 1.75;

type Glyph = (color: string) => ReactElement;

const outline: Record<IconName, Glyph> = {
  list: (c) => (
    <Path d="M5 7h14M5 12h14M5 17h9" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
  ),
  alert: (c) => (
    <>
      <Path
        d="M12 3.5L2.75 20h18.5z"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M12 10v4.5" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx={12} cy={17.25} r={1} fill={c} />
    </>
  ),
  star: (c) => (
    <Path
      d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"
      stroke={c}
      strokeWidth={STROKE}
      strokeLinejoin="round"
      fill="none"
    />
  ),
  trophy: (c) => (
    <Path
      d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 14v4M8.5 20h7"
      stroke={c}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  heart: (c) => (
    <Path
      d="M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.4 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"
      stroke={c}
      strokeWidth={STROKE}
      strokeLinejoin="round"
      fill="none"
    />
  ),
  check: (c) => (
    <Path
      d="M5 12.5l4.5 4.5L19 7.5"
      stroke={c}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  clock: (c) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={STROKE} fill="none" />
      <Path
        d="M12 7v5l3.5 2"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
  'chevron-left': (c) => (
    <Path
      d="M15 5l-7 7 7 7"
      stroke={c}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
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
  plus: (c) => <Path d="M12 5v14M5 12h14" stroke={c} strokeWidth={2.5} strokeLinecap="round" />,
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

export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  const glyph = outline[name];
  return (
    <View
      testID={`icon-${name}`}
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
