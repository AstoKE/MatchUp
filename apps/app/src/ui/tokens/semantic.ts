import { palette as p } from './primitives';

/** Semantic tokens (layer 2): the only colors components may use. */
export interface SemanticColors {
  bgApp: string;
  surfaceRaised: string;
  surfaceSunken: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  actionPrimary: string;
  onActionPrimary: string;
  link: string;
  accent: string;
  onAccent: string;
  danger: string;
  onDanger: string;
  warning: string;
  success: string;
  borderStrong: string;
  borderSubtle: string;
  focusRing: string;
  overlay: string;
}

export const lightColors: SemanticColors = {
  bgApp: p.paper50,
  surfaceRaised: p.white,
  surfaceSunken: p.paper100,
  textPrimary: p.ink900,
  textSecondary: p.gray600,
  textDisabled: p.gray500,
  // The brand's lime does not work as text or fill on light grounds: the primary action is ink with a lime label.
  actionPrimary: p.ink900,
  onActionPrimary: p.lime400,
  link: p.olive700,
  accent: p.lime400,
  onAccent: p.ink900,
  danger: p.red700,
  onDanger: p.white,
  warning: p.amber800,
  success: p.success700,
  borderStrong: p.gray500,
  borderSubtle: p.paper300,
  focusRing: p.blue700,
  overlay: 'rgba(14, 17, 22, 0.5)',
};

export const darkColors: SemanticColors = {
  bgApp: p.ink900,
  surfaceRaised: p.ink800,
  surfaceSunken: p.ink950,
  textPrimary: p.steel100,
  textSecondary: p.steel300,
  textDisabled: p.ink500,
  actionPrimary: p.lime400,
  onActionPrimary: p.ink900,
  link: p.lime400,
  accent: p.lime400,
  onAccent: p.ink900,
  danger: p.red300,
  onDanger: p.ink900,
  warning: p.amber300,
  success: p.success300,
  borderStrong: p.ink500,
  borderSubtle: p.ink700,
  focusRing: p.blue300,
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/**
 * Foreground/background pairs that MUST meet WCAG 2.2 AA: 4.5:1 for text, 3:1 for UI boundaries and
 * focus indicators. Enforced by tokens.test.ts for both themes.
 */
export const requiredContrast: readonly {
  fg: keyof SemanticColors;
  bg: keyof SemanticColors;
  min: number;
  note: string;
}[] = [
  { fg: 'textPrimary', bg: 'bgApp', min: 4.5, note: 'body text on page' },
  { fg: 'textPrimary', bg: 'surfaceRaised', min: 4.5, note: 'body text on cards' },
  { fg: 'textPrimary', bg: 'surfaceSunken', min: 4.5, note: 'body text on sunken areas' },
  { fg: 'textSecondary', bg: 'bgApp', min: 4.5, note: 'secondary text on page' },
  { fg: 'textSecondary', bg: 'surfaceRaised', min: 4.5, note: 'secondary text on cards' },
  { fg: 'onActionPrimary', bg: 'actionPrimary', min: 4.5, note: 'primary button label' },
  { fg: 'link', bg: 'bgApp', min: 4.5, note: 'links on page' },
  { fg: 'link', bg: 'surfaceRaised', min: 4.5, note: 'links on cards' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, note: 'highlight label' },
  { fg: 'onDanger', bg: 'danger', min: 4.5, note: 'destructive button label' },
  { fg: 'danger', bg: 'bgApp', min: 4.5, note: 'error text on page' },
  { fg: 'danger', bg: 'surfaceRaised', min: 4.5, note: 'error text on cards' },
  { fg: 'warning', bg: 'bgApp', min: 4.5, note: 'warning text' },
  { fg: 'warning', bg: 'surfaceRaised', min: 4.5, note: 'warning text on cards' },
  { fg: 'success', bg: 'bgApp', min: 4.5, note: 'success text' },
  { fg: 'success', bg: 'surfaceRaised', min: 4.5, note: 'success text on cards' },
  { fg: 'borderStrong', bg: 'surfaceRaised', min: 3, note: 'input/control boundary' },
  { fg: 'focusRing', bg: 'bgApp', min: 3, note: 'focus indicator on page' },
  { fg: 'focusRing', bg: 'surfaceRaised', min: 3, note: 'focus indicator on cards' },
];
