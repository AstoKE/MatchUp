/**
 * Central branding configuration.
 *
 * The product name is TEMPORARY (ADR-0010). Every user-visible brand value comes from here
 * (or from i18n resources that interpolate it); no other source file may contain the name.
 * Public URLs are NOT hard-coded: they come from validated environment variables.
 */
export const brand = {
  /** Display name. Temporary working name. */
  name: 'MatchUp',
  taglines: {
    tr: 'Sporunu seç, takımını bul, oyuna katıl.',
    en: 'Choose your sport. Find your team. Join the game.',
  },
  /**
   * TEMPORARY development identifiers (ADR-0010, D-05). `example.com` is a reserved documentation
   * domain; Google Play rejects `com.example.*`, so these cannot be published by accident.
   * Replace with final identifiers before any store/TestFlight submission.
   */
  identifiers: {
    slug: 'matchup',
    appId: 'com.example.matchup.dev',
    scheme: 'matchup-dev',
    /** Expo account that owns the EAS project, and the project's id (linked 2026-10-25). Not secrets. */
    expoOwner: 'matchupproject',
    easProjectId: '6c20128e-275c-4b45-babd-869e6a1dd5df',
  },
  /** Provisional logo — NOT final; its palette is not the design system (docs/UI_DESIGN_SYSTEM.md). */
  logo: { provisional: true },
  contact: { supportEmail: null as string | null },
} as const;

export type Brand = typeof brand;
