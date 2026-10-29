import type { ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * One in-house outline glyph per sport (docs/design.md §7): 24 px grid, 1.75 px stroke, rounded joins,
 * a simple silhouette (the ball or racket plus one distinguishing mark). Drawn for this product, not taken
 * from an icon pack. Keyed by the catalog slug; an unknown slug (a sport added later by a migration) gets a
 * neutral ball so a new sport never renders blank.
 */
const STROKE = 1.75;

type Glyph = (c: string) => ReactElement;

const line = (c: string, d: string) => (
  <Path
    d={d}
    stroke={c}
    strokeWidth={STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
    fill="none"
  />
);
const ring = (c: string, cx: number, cy: number, r: number) => (
  <Circle cx={cx} cy={cy} r={r} stroke={c} strokeWidth={STROKE} fill="none" />
);
const dot = (c: string, cx: number, cy: number, r = 1) => <Circle cx={cx} cy={cy} r={r} fill={c} />;

const glyphs: Record<string, Glyph> = {
  football: (c) => (
    <>
      {ring(c, 12, 12, 9)}
      {line(c, 'M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4z')}
      {line(
        c,
        'M12 8.2V3.4M15.4 10.7l4.4-1.5M14.1 14.7l2.7 3.6M9.9 14.7l-2.7 3.6M8.6 10.7L4.2 9.2',
      )}
    </>
  ),
  futsal: (c) => (
    <>
      {ring(c, 12, 10, 7)}
      {line(c, 'M12 7.4l2.4 1.7-.9 2.8h-3l-.9-2.8z')}
      {line(c, 'M4 20.5h16')}
    </>
  ),
  basketball: (c) => (
    <>
      {ring(c, 12, 12, 9)}
      {line(c, 'M12 3v18M3 12h18')}
      {line(c, 'M5.7 5.7c3.1 3.4 3.1 9.2 0 12.6M18.3 5.7c-3.1 3.4-3.1 9.2 0 12.6')}
    </>
  ),
  volleyball: (c) => (
    <>
      {ring(c, 12, 12, 9)}
      {line(c, 'M12.2 3c1.2 3.7.9 6.7-1 9.6')}
      {line(c, 'M4.4 7.8c3.6-.9 6.7.1 9 3.1')}
      {line(c, 'M19.2 8.4c-1.2 3.6-3.7 5.6-7 6.1')}
      {line(c, 'M8.5 19.8c-.3-3.4.8-6.1 3.4-8')}
    </>
  ),
  tennis: (c) => (
    <>
      {ring(c, 12, 12, 9)}
      {line(c, 'M5.4 5.4c3.7 3.8 3.7 9.4 0 13.2M18.6 5.4c-3.7 3.8-3.7 9.4 0 13.2')}
    </>
  ),
  padel: (c) => (
    <>
      {line(
        c,
        'M12 3c3.9 0 6.2 2.5 6.2 5.4 0 2.9-1.6 4.7-3.2 6.2H9c-1.6-1.5-3.2-3.3-3.2-6.2C5.8 5.5 8.1 3 12 3z',
      )}
      {line(c, 'M10.6 14.6V21h2.8v-6.4')}
      {dot(c, 9.6, 7)}
      {dot(c, 14.4, 7)}
      {dot(c, 12, 9.4)}
      {dot(c, 9.6, 11.6)}
      {dot(c, 14.4, 11.6)}
    </>
  ),
  badminton: (c) => (
    <>
      {line(c, 'M9.6 14.2L7.2 4.6M14.4 14.2l2.4-9.6M12 14.2V4.4')}
      {line(c, 'M7.2 4.6c3.2-1.2 6.4-1.2 9.6 0')}
      {line(c, 'M9.6 14.2h4.8v2.4a2.4 2.4 0 0 1-4.8 0z')}
    </>
  ),
  'table-tennis': (c) => (
    <>
      {ring(c, 10.6, 10, 6.8)}
      {line(c, 'M15.4 15l2.8 2.8a1.5 1.5 0 0 1-2.1 2.1L13.3 17.1')}
      {ring(c, 19, 5, 1.6)}
    </>
  ),
  running: (c) => (
    <>
      {ring(c, 14.6, 4.9, 1.8)}
      {line(c, 'M13 8.7L11 14')}
      {line(c, 'M11 14l3.6 3.4-1.1 3.6M11 14l-3.2 3.1-2.4-.9')}
      {line(c, 'M13 9.6l3.6 2.2M13 9.6l-3.6 1.4-2 -1.7')}
    </>
  ),
  walking: (c) => (
    <>
      {ring(c, 12, 4.9, 1.9)}
      {line(c, 'M12 8v7M12 9.4l-3 3.2M12 9.4l3 3.2')}
      {line(c, 'M12 15l-2.4 6M12 15l2.4 6')}
    </>
  ),
};

const fallback: Glyph = (c) => (
  <>
    {ring(c, 12, 12, 9)}
    {dot(c, 12, 12, 1.6)}
  </>
);

/** Decorative: always hidden from assistive tech; the sport's name sits right next to it. */
export function SportIcon({
  slug,
  color,
  size = 24,
}: {
  slug: string | undefined;
  color: string;
  size?: number;
}) {
  const glyph = (slug ? glyphs[slug] : undefined) ?? fallback;
  return (
    <View
      testID={`sport-icon-${slug ?? 'unknown'}`}
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

/** Decorative tints (design.md §4.6), used only at low opacity behind the icon; the name carries the meaning. */
export const SPORT_TINTS: Record<string, string> = {
  football: '#2E9E5B',
  futsal: '#1FA38A',
  basketball: '#E0701F',
  volleyball: '#D9A400',
  tennis: '#9AB800',
  padel: '#2A8FD6',
  badminton: '#6B5BD6',
  'table-tennis': '#D6457A',
  running: '#C2410C',
  walking: '#5B6B82',
};

/** The sport's icon on a soft tint (design.md §4.6: 12-16 % opacity; the icon stays in the text colour). */
export function SportBadge({ slug, size = 32 }: { slug: string | undefined; size?: number }) {
  const { colors, radius } = useTheme();
  const tint = (slug && SPORT_TINTS[slug]) || colors.borderStrong;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: `${tint}29`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SportIcon slug={slug} color={colors.textPrimary} size={Math.round(size * 0.68)} />
    </View>
  );
}
