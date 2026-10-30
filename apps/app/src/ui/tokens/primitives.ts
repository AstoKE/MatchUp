/**
 * Primitive design tokens (layer 1). Direction A "Gece Maçı" chosen by the founder 2026-10-30
 * (docs/design.md). The light theme is derived from it, not drawn by the founder.
 * Components never use primitives directly — they use semantic tokens via useTheme().
 */
export const palette = {
  ink950: '#0A0D12',
  ink900: '#0E1116',
  ink800: '#171C23',
  ink700: '#222B38',
  ink500: '#6B7888',
  steel300: '#A9B4C0',
  steel100: '#F2F5F7',
  paper50: '#F4F6F8',
  paper100: '#E9EDF2',
  paper300: '#D5DCE4',
  gray600: '#4A5565',
  gray500: '#7A8696',
  white: '#FFFFFF',
  lime400: '#C6F432',
  olive700: '#3F6B00',
  red700: '#B42318',
  red300: '#FF8A80',
  amber800: '#8A4B00',
  amber300: '#FFB454',
  success700: '#067647',
  success300: '#6EE7A8',
  blue700: '#1D4ED8',
  blue300: '#93B4FF',
} as const;

/** 4-pt spacing scale. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  14: 56,
  18: 72,
} as const;

export const radius = { sm: 6, md: 10, lg: 20, xl: 28, pill: 999 } as const;

export const typography = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: '700' },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  titleSm: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;
export type TypographyVariant = keyof typeof typography;

/** Maximum OS font scaling we design for (WCAG: text must be resizable without loss; layouts wrap). */
export const MAX_FONT_SCALE = 1.6;

export const motion = { fast: 120, base: 200, slow: 300 } as const;

/** Layout breakpoints (min widths). */
export const breakpoints = { medium: 768, expanded: 1200 } as const;
export type Breakpoint = 'compact' | 'medium' | 'expanded';

export function breakpointForWidth(width: number): Breakpoint {
  if (width >= breakpoints.expanded) return 'expanded';
  if (width >= breakpoints.medium) return 'medium';
  return 'compact';
}

/** Minimum interactive target sizes (iOS 44pt / Android 48dp; we use 48 everywhere). */
export const TOUCH_TARGET = 48;
