/**
 * Primitive design tokens (layer 1): charcoal and warm red, docs/design.md §3 and §11 (the measured deviations).
 * The light theme is derived, not drawn. Components never use primitives directly: semantic tokens via useTheme().
 */
export const palette = {
  charcoal950: '#0B0B0C',
  charcoal925: '#111113',
  charcoal900: '#18191B',
  charcoal800: '#222326',
  charcoal700: '#323438',
  gray550: '#7A7F87',
  gray600: '#6F747C',
  gray400: '#8D929A',
  gray300: '#AAAEB5',
  gray100: '#F5F5F6',
  paper50: '#F6F6F7',
  paper100: '#ECECEE',
  paper300: '#DDDEE1',
  slate700: '#55585F',
  slate600: '#62666D',
  slate500: '#7F848B',
  ink950: '#111113',
  white: '#FFFFFF',
  red500: '#D73641',
  red600: '#B82633',
  redLight500: '#C42B38',
  redLight600: '#A32230',
  coral300: '#FF8A8F',
  coral700: '#B3212E',
  danger300: '#EC6262',
  danger700: '#A61B1B',
  amber300: '#E6AB4A',
  amber800: '#8A4B00',
  success300: '#45B58A',
  success700: '#067647',
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

export const radius = { sm: 6, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** Loaded in app/_layout.tsx. One family per weight: a fontWeight on top would be synthesized or ignored per platform. */
export const fontFamily = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontFamily: fontFamily.bold },
  headline: { fontSize: 26, lineHeight: 32, fontFamily: fontFamily.bold },
  title: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.bold },
  titleSm: { fontSize: 17, lineHeight: 24, fontFamily: fontFamily.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fontFamily.regular },
  bodySm: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular },
  label: { fontSize: 15, lineHeight: 20, fontFamily: fontFamily.semibold },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
  micro: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.semibold },
} as const;
export type TypographyVariant = keyof typeof typography;

/** Maximum OS font scaling we design for (WCAG: text must be resizable without loss; layouts wrap). */
export const MAX_FONT_SCALE = 1.6;

export const motion = { fast: 140, base: 180, slow: 220 } as const;

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
