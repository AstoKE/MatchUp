import { navItems, reservedNavItems } from './config';
import { enResources } from '@/lib/i18n/en-resources';
import { resources as trOnly } from '@/lib/i18n/resources';

const resources = { tr: trOnly.tr, en: enResources };

describe('navigation config (D-02)', () => {
  it('ships exactly the four MVP destinations, Create being emphasized', () => {
    expect(navItems.map((i) => i.name)).toEqual(['index', 'my-events', 'create', 'profile']);
    expect(navItems.filter((i) => i.emphasized).map((i) => i.name)).toEqual(['create']);
  });

  it('only Discover is public (guest discovery, D-09)', () => {
    expect(navItems.filter((i) => i.access === 'public').map((i) => i.name)).toEqual(['index']);
  });

  it('every item has a label in both languages', () => {
    for (const item of navItems) {
      expect(resources.tr.nav[item.labelKey].length).toBeGreaterThan(0);
      expect(resources.en.nav[item.labelKey].length).toBeGreaterThan(0);
    }
  });

  it('keeps Community reserved but hidden', () => {
    expect(reservedNavItems.map((i) => i.name)).toEqual(['community']);
    expect(navItems.some((i) => (i.name as string) === 'community')).toBe(false);
  });
});
