/**
 * Data-driven primary navigation (D-02). MVP ships four visible destinations. A future Community
 * section is added by appending an item here and adding its route file — no layout changes.
 */
export interface NavItem {
  /** Route file name inside app/(tabs)/ */
  name: 'index' | 'my-events' | 'create' | 'profile';
  labelKey: 'discover' | 'myEvents' | 'create' | 'profile';
  icon: 'compass-outline' | 'calendar-outline' | 'add-circle' | 'person-outline';
  iconFocused: 'compass' | 'calendar' | 'add-circle' | 'person';
  /** public = guests may open it (D-09); authenticated = needs an account. */
  access: 'public' | 'authenticated';
  /** Visually emphasized primary action (Create). */
  emphasized?: boolean;
}

export const navItems: readonly NavItem[] = [
  {
    name: 'index',
    labelKey: 'discover',
    icon: 'compass-outline',
    iconFocused: 'compass',
    access: 'public',
  },
  {
    name: 'my-events',
    labelKey: 'myEvents',
    icon: 'calendar-outline',
    iconFocused: 'calendar',
    access: 'authenticated',
  },
  {
    name: 'create',
    labelKey: 'create',
    icon: 'add-circle',
    iconFocused: 'add-circle',
    access: 'authenticated',
    emphasized: true,
  },
  {
    name: 'profile',
    labelKey: 'profile',
    icon: 'person-outline',
    iconFocused: 'person',
    access: 'authenticated',
  },
];

/** Reserved, not rendered in the MVP (PRD §3). */
export const reservedNavItems = [{ name: 'community', labelKey: 'community' }] as const;
