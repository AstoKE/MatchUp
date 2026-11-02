import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

interface Court {
  lines: string;
  /** Drawn heavier: a net or a wall. */
  heavy?: string;
  dots?: readonly (readonly [number, number])[];
  dashed?: boolean;
}

const RING_10 = 'M50 40a10 10 0 1 0 20 0a10 10 0 1 0-20 0z';
const RING_9 = 'M51 40a9 9 0 1 0 18 0a9 9 0 1 0-18 0z';
const FIELD = 'M6 6h108v68H6zM60 6v68';

/** Our own line art of each playing area (docs/design.md §7), on a 120 × 80 grid. */
const courts: Record<string, Court> = {
  football: { lines: `${FIELD}${RING_10}M6 24h18v32H6zM96 24h18v32H96z` },
  futsal: { lines: `${FIELD}${RING_9}M6 22q22 18 0 36M114 22q-22 18 0 36` },
  basketball: {
    lines: `${FIELD}${RING_9}M6 28h24v24H6zM90 28h24v24H90zM6 14h12a28 26 0 0 1 0 52H6M114 14h-12a28 26 0 0 0 0 52h12`,
  },
  volleyball: { lines: 'M6 10h108v60H6zM40 10v60M80 10v60', heavy: 'M60 10v60' },
  tennis: { lines: 'M6 10h108v60H6zM6 18h108v44H6zM60 10v60M36 18v44M84 18v44M36 40h48' },
  padel: {
    lines: 'M11 17h98v46H11zM60 12v56M36 17v46M84 17v46M36 40h48',
    heavy: 'M6 12h108v56H6z',
  },
  badminton: {
    lines: 'M6 12h108v56H6zM60 12v56M6 21h108M6 59h108M42 21v38M78 21v38M42 40H6M78 40h36',
  },
  'table-tennis': { lines: 'M14 14h92v52H14zM60 8v64M14 40h92', dots: [[86, 26]] },
  running: {
    lines:
      'M34 16h52a24 24 0 0 1 0 48H34a24 24 0 0 1 0-48zM36 26h48a14 14 0 0 1 0 28H36a14 14 0 0 1 0-28zM60 16v10',
  },
  walking: {
    lines: 'M8 62c20-8 18-30 38-30s14 22 34 18 22-26 32-30',
    dashed: true,
    dots: [
      [112, 20],
      [8, 62],
    ],
  },
};
const unknownCourt: Court = { lines: 'M6 6h108v68H6z' };

/** Decorative: the sport's name is always in the text beside it. */
export function CourtDrawing({ slug, color }: { slug: string | undefined; color: string }) {
  const court = (slug ? courts[slug] : undefined) ?? unknownCourt;
  return (
    <View
      testID={`court-${slug ?? 'unknown'}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{ flex: 1, minHeight: 0 }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 120 80">
        <Path
          d={court.lines}
          fill="none"
          stroke={color}
          strokeOpacity={0.85}
          strokeWidth={1.5}
          strokeDasharray={court.dashed ? '3 4' : undefined}
        />
        {court.heavy ? (
          <Path d={court.heavy} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={3} />
        ) : null}
        {court.dots?.map(([cx, cy]) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3} fill={color} />
        ))}
      </Svg>
    </View>
  );
}
