import { describe, expect, it } from 'vitest';
import { defaultCityId, filterByName, foldTurkish, formatDistance } from './place';

describe('foldTurkish', () => {
  it('folds case and the Turkish letters', () => {
    expect(foldTurkish('İzmir')).toBe('izmir');
    expect(foldTurkish('IĞDIR')).toBe('igdir');
    expect(foldTurkish('Şanlıurfa')).toBe('sanliurfa');
    expect(foldTurkish('Kâhta ')).toBe('kahta');
  });
});

describe('filterByName', () => {
  const options = [
    { label: 'Ankara' },
    { label: 'İstanbul' },
    { label: 'İzmir' },
    { label: 'Kırıkkale' },
    { label: 'Şanlıurfa' },
  ];
  it('matches without Turkish letters, prefix matches first', () => {
    expect(filterByName(options, 'izm').map((o) => o.label)).toEqual(['İzmir']);
    expect(filterByName(options, 'URFA').map((o) => o.label)).toEqual(['Şanlıurfa']);
    expect(filterByName(options, 'k').map((o) => o.label)).toEqual(['Kırıkkale', 'Ankara']);
  });
  it('keeps everything for an empty query', () => {
    expect(filterByName(options, '  ')).toHaveLength(5);
  });
});

describe('defaultCityId', () => {
  const cities = [
    { id: 'a', slug: 'adana' },
    { id: 'k', slug: 'ankara' },
    { id: 'i', slug: 'izmir' },
  ];
  it('prefers the profile, then the device, then Ankara', () => {
    expect(defaultCityId(cities, { profileCityId: 'i', storedCityId: 'a' })).toBe('i');
    expect(defaultCityId(cities, { profileCityId: null, storedCityId: 'a' })).toBe('a');
    expect(defaultCityId(cities, {})).toBe('k');
  });
  it('ignores ids the catalog no longer has', () => {
    expect(defaultCityId(cities, { profileCityId: 'gone', storedCityId: 'also-gone' })).toBe('k');
    expect(defaultCityId([], {})).toBeNull();
  });
});

describe('formatDistance', () => {
  it('rounds to 100 m below a kilometre, never shows 0 m', () => {
    expect(formatDistance(0, 'tr')).toBe('100 m');
    expect(formatDistance(849, 'tr')).toBe('800 m');
  });
  it('one decimal up to 10 km, in the locale', () => {
    expect(formatDistance(1234, 'tr')).toBe('1,2 km');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
    expect(formatDistance(23_600, 'tr')).toBe('24 km');
  });
});
