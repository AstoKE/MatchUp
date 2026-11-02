/**
 * Primitive design tokens (layer 1): Theme E, docs/design.md §3 and §13.
 * Components never use primitives directly: semantic tokens via useTheme().
 */
export const palette = {
  white: '#FFFFFF',
  ink950: '#11231D',
  // Green-tinted neutrals, light to dark.
  paper50: '#F2F5F1',
  paper100: '#E7ECE7',
  paper300: '#D9E0DA',
  sage500: '#7C8C84',
  sage600: '#5C6C65',
  sage700: '#4B5C55',
  mist300: '#A9B7B0',
  mist400: '#8FA098',
  mist600: '#6F8078',
  forest950: '#0E1512',
  forest925: '#121A16',
  forest900: '#17211C',
  forest800: '#1F2B25',
  forest700: '#2B3832',
  forest650: '#33443C',
  blue500: '#2F4FD0',
  blue600: '#2540AE',
  blue200: '#AEBBFF',
  danger700: '#B3261E',
  danger300: '#FF8A80',
  amber800: '#7A5600',
  amber300: '#E3B64F',
  success700: '#1F6B4F',
  success300: '#5FC79B',
  // One per sport; some equal a color above on purpose (design.md §3.1).
  courtFootball: '#1F6B4F',
  courtFutsal: '#2F4FD0',
  courtBasketball: '#A4561A',
  courtVolleyball: '#E3B64F',
  courtTennis: '#17707F',
  courtPadel: '#4A3FB0',
  courtBadminton: '#7A2E8E',
  courtTableTennis: '#0F5C8A',
  courtRunning: '#B23A2E',
  courtWalking: '#5B6B2E',
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

export const radius = {
  sm: 8,
  md: 16,
  button: 18,
  tile: 20,
  lg: 22,
  xl: 24,
  pill: 999,
} as const;

/** Loaded in app/_layout.tsx. One family per weight: a fontWeight on top would be synthesized or ignored per platform. */
export const fontFamily = {
  regular: 'Figtree_400Regular',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extrabold: 'Figtree_800ExtraBold',
  headingBold: 'BricolageGrotesque_700Bold',
  headingExtrabold: 'BricolageGrotesque_800ExtraBold',
} as const;

export const typography = {
  display: {
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1,
    fontFamily: fontFamily.headingExtrabold,
  },
  headline: {
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    fontFamily: fontFamily.headingExtrabold,
  },
  title: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3, fontFamily: fontFamily.headingBold },
  titleSm: { fontSize: 17, lineHeight: 24, fontFamily: fontFamily.bold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fontFamily.regular },
  bodySm: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular },
  label: { fontSize: 15, lineHeight: 20, fontFamily: fontFamily.bold },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
  micro: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.extrabold },
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
