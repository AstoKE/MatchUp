import { palette as p } from './primitives';

/** Semantic tokens (layer 2): the only colors components may use. */
export interface SemanticColors {
  bgApp: string;
  surfaceRaised: string;
  surfaceSunken: string;
  /** Active layers and modal surfaces. */
  surfaceOverlay: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  actionPrimary: string;
  actionPrimaryPressed: string;
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
  surfaceOverlay: p.white,
  textPrimary: p.ink950,
  textSecondary: p.slate700,
  textTertiary: p.slate600,
  textDisabled: p.slate500,
  actionPrimary: p.redLight500,
  actionPrimaryPressed: p.redLight600,
  onActionPrimary: p.white,
  link: p.coral700,
  accent: p.redLight500,
  onAccent: p.white,
  danger: p.danger700,
  onDanger: p.white,
  warning: p.amber800,
  success: p.success700,
  borderStrong: p.slate500,
  borderSubtle: p.paper300,
  focusRing: p.blue700,
  overlay: 'rgba(17, 17, 19, 0.5)',
};

export const darkColors: SemanticColors = {
  bgApp: p.charcoal950,
  surfaceRaised: p.charcoal900,
  surfaceSunken: p.charcoal925,
  surfaceOverlay: p.charcoal800,
  textPrimary: p.gray100,
  textSecondary: p.gray300,
  textTertiary: p.gray400,
  textDisabled: p.gray600,
  actionPrimary: p.red500,
  actionPrimaryPressed: p.red600,
  onActionPrimary: p.white,
  // Red text fails on dark surfaces: links and active text use a lighter coral.
  link: p.coral300,
  accent: p.red500,
  onAccent: p.white,
  danger: p.danger300,
  onDanger: p.charcoal950,
  warning: p.amber300,
  success: p.success300,
  borderStrong: p.gray550,
  borderSubtle: p.charcoal700,
  focusRing: p.blue300,
  overlay: 'rgba(0, 0, 0, 0.6)',
};

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
  { fg: 'textPrimary', bg: 'surfaceOverlay', min: 4.5, note: 'body text on modals' },
  { fg: 'textSecondary', bg: 'surfaceOverlay', min: 4.5, note: 'secondary text on modals' },
  { fg: 'textTertiary', bg: 'bgApp', min: 4.5, note: 'tertiary text on page' },
  { fg: 'textTertiary', bg: 'surfaceRaised', min: 4.5, note: 'tertiary text on cards' },
  { fg: 'onActionPrimary', bg: 'actionPrimaryPressed', min: 4.5, note: 'pressed button label' },
  { fg: 'link', bg: 'surfaceOverlay', min: 4.5, note: 'links on modals' },
  { fg: 'success', bg: 'surfaceOverlay', min: 4.5, note: 'success text on modals' },
  { fg: 'danger', bg: 'surfaceOverlay', min: 4.5, note: 'error text on modals' },
  { fg: 'warning', bg: 'surfaceOverlay', min: 4.5, note: 'warning text on modals' },
  { fg: 'borderStrong', bg: 'bgApp', min: 3, note: 'input boundary on page' },
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
