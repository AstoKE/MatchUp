import { navItems } from './config';
import { tabAccessibilityLabel } from './tab-label';
import { i18n, initI18n } from '@/lib/i18n';

// The four hidden event/inbox routes are not destinations; only navItems are counted.
describe('tabAccessibilityLabel', () => {
  const label = (locale: 'en' | 'tr', position: number, os: string) => {
    initI18n(locale);
    const t = i18n.getFixedT(locale, 'nav');
    const key = navItems[position - 1]!.labelKey;
    return tabAccessibilityLabel(t, t(key), position, navItems.length, os);
  };

  it('counts the four visible tabs on iOS, not the hidden routes', () => {
    expect(label('en', 1, 'ios')).toBe('Discover, tab, 1 of 4');
    expect(label('en', 4, 'ios')).toBe('Profile, tab, 4 of 4');
  });

  it('is localized', () => {
    expect(label('tr', 2, 'ios')).toBe('Etkinliklerim, sekme, 2 / 4');
  });

  it.each(['android', 'web'])('leaves %s on its default label', (os) => {
    expect(label('en', 1, os)).toBeUndefined();
  });
});
