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
  /** A chosen chip or segment; the action blue stays for actions. */
  selected: string;
  onSelected: string;
  statusApproved: string;
  onStatusApproved: string;
  statusPending: string;
  onStatusPending: string;
  /** The floating dock is dark in both themes, so it has its own colors, its own focus ring included. */
  dock: string;
  dockBorder: string;
  onDock: string;
  dockActive: string;
  onDockActive: string;
  dockFocusRing: string;
  shadow: string;
}

export const lightColors: SemanticColors = {
  bgApp: p.paper50,
  surfaceRaised: p.white,
  surfaceSunken: p.paper100,
  surfaceOverlay: p.white,
  textPrimary: p.ink950,
  textSecondary: p.sage700,
  textTertiary: p.sage600,
  textDisabled: p.sage500,
  actionPrimary: p.blue500,
  actionPrimaryPressed: p.blue600,
  onActionPrimary: p.white,
  link: p.blue500,
  accent: p.blue500,
  onAccent: p.white,
  danger: p.danger700,
  onDanger: p.white,
  warning: p.amber800,
  success: p.success700,
  borderStrong: p.sage500,
  borderSubtle: p.paper300,
  focusRing: p.blue500,
  overlay: 'rgba(17, 35, 29, 0.5)',
  selected: p.ink950,
  onSelected: p.white,
  statusApproved: p.success700,
  onStatusApproved: p.white,
  statusPending: p.amber300,
  onStatusPending: p.ink950,
  dock: p.ink950,
  dockBorder: p.ink950,
  onDock: p.paper50,
  dockActive: p.paper50,
  onDockActive: p.ink950,
  dockFocusRing: p.blue200,
  shadow: 'rgba(17, 35, 29, 0.35)',
};

export const darkColors: SemanticColors = {
  bgApp: p.forest950,
  surfaceRaised: p.forest900,
  surfaceSunken: p.forest925,
  surfaceOverlay: p.forest800,
  textPrimary: p.paper50,
  textSecondary: p.mist300,
  textTertiary: p.mist400,
  textDisabled: p.mist600,
  actionPrimary: p.blue500,
  actionPrimaryPressed: p.blue600,
  onActionPrimary: p.white,
  // The action blue is 2.78:1 on the dark page: links and active text use a lighter blue.
  link: p.blue200,
  accent: p.blue500,
  onAccent: p.white,
  danger: p.danger300,
  onDanger: p.forest950,
  warning: p.amber300,
  success: p.success300,
  borderStrong: p.mist600,
  borderSubtle: p.forest700,
  focusRing: p.blue200,
  overlay: 'rgba(0, 0, 0, 0.6)',
  selected: p.paper50,
  onSelected: p.ink950,
  statusApproved: p.success700,
  onStatusApproved: p.white,
  statusPending: p.amber300,
  onStatusPending: p.ink950,
  dock: p.forest800,
  dockBorder: p.forest650,
  onDock: p.paper50,
  dockActive: p.paper50,
  onDockActive: p.ink950,
  dockFocusRing: p.blue200,
  shadow: 'rgba(0, 0, 0, 0.55)',
};

/** One per catalog sport, the same in both themes; `on` is the label and line drawing on it. */
export const sportColors: Readonly<Record<string, { court: string; on: string }>> = {
  football: { court: p.courtFootball, on: p.white },
  futsal: { court: p.courtFutsal, on: p.white },
  basketball: { court: p.courtBasketball, on: p.white },
  volleyball: { court: p.courtVolleyball, on: p.ink950 },
  tennis: { court: p.courtTennis, on: p.white },
  padel: { court: p.courtPadel, on: p.white },
  badminton: { court: p.courtBadminton, on: p.white },
  'table-tennis': { court: p.courtTableTennis, on: p.white },
  running: { court: p.courtRunning, on: p.white },
  walking: { court: p.courtWalking, on: p.white },
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
  { fg: 'onSelected', bg: 'selected', min: 4.5, note: 'chosen chip' },
  { fg: 'onStatusApproved', bg: 'statusApproved', min: 4.5, note: 'approved chip' },
  { fg: 'onStatusPending', bg: 'statusPending', min: 4.5, note: 'pending chip' },
  { fg: 'onDock', bg: 'dock', min: 4.5, note: 'dock icons and labels' },
  { fg: 'onDockActive', bg: 'dockActive', min: 4.5, note: 'active dock item' },
  { fg: 'dockFocusRing', bg: 'dock', min: 3, note: 'focus indicator in the dock' },
];
