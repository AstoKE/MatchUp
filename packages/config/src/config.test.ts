import { describe, expect, it } from 'vitest';
import { brand, DEFAULT_LOCALE, isSupportedLocale, market, SUPPORTED_LOCALES } from './index';

describe('brand config', () => {
  it('uses a clearly temporary, unpublishable development identifier', () => {
    expect(brand.identifiers.appId.startsWith('com.example.')).toBe(true);
  });
  it('has both launch-language taglines', () => {
    expect(brand.taglines.tr.length).toBeGreaterThan(0);
    expect(brand.taglines.en.length).toBeGreaterThan(0);
  });
});

describe('market config', () => {
  it('is Turkish-first with English supported', () => {
    expect(DEFAULT_LOCALE).toBe('tr');
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(isSupportedLocale('tr')).toBe(true);
    expect(isSupportedLocale('de')).toBe(false);
  });
  it('targets Ankara / Istanbul timezone / adults only', () => {
    expect(market.timezone).toBe('Europe/Istanbul');
    expect(market.minimumAge).toBe(18);
  });
});
