import type { Catalog } from './api/catalog-api';
import { CATALOG_MAX_AGE_MS, loadCatalog } from './load-catalog';

const mockStore = { json: null as string | null, writes: [] as string[] };
const mockFetch = jest.fn<Promise<Catalog>, []>();
jest.mock('./catalog-cache', () => ({
  readCachedCatalog: () => Promise.resolve(mockStore.json),
  writeCachedCatalog: (json: string) => {
    mockStore.writes.push(json);
    return Promise.resolve();
  },
}));
jest.mock('./api/catalog-api', () => ({ fetchCatalog: () => mockFetch() }));

const catalog = (name: string): Catalog => ({
  sports: [],
  cities: [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      slug: 'ankara',
      names: { tr: name, en: name },
      timeZone: 'Europe/Istanbul',
      districts: [],
    },
  ],
});
const NOW = 1_800_000_000_000;

beforeEach(() => {
  mockStore.json = null;
  mockStore.writes = [];
  mockFetch.mockReset();
});

describe('loadCatalog', () => {
  it('downloads once and keeps it, with the time', async () => {
    mockFetch.mockResolvedValue(catalog('Sunucu'));
    expect((await loadCatalog(NOW)).cities[0]?.names.tr).toBe('Sunucu');
    expect(JSON.parse(mockStore.writes[0]!)).toEqual({ savedAt: NOW, catalog: catalog('Sunucu') });
  });

  it('uses a catalog kept less than a day ago without asking the server', async () => {
    mockStore.json = JSON.stringify({
      savedAt: NOW - CATALOG_MAX_AGE_MS + 1000,
      catalog: catalog('Cihaz'),
    });
    expect((await loadCatalog(NOW)).cities[0]?.names.tr).toBe('Cihaz');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('asks again after a day', async () => {
    mockStore.json = JSON.stringify({
      savedAt: NOW - CATALOG_MAX_AGE_MS - 1,
      catalog: catalog('Eski'),
    });
    mockFetch.mockResolvedValue(catalog('Yeni'));
    expect((await loadCatalog(NOW)).cities[0]?.names.tr).toBe('Yeni');
    expect(mockStore.writes).toHaveLength(1);
  });

  it('falls back to an old catalog when the server cannot be reached, so the app opens offline', async () => {
    mockStore.json = JSON.stringify({
      savedAt: NOW - 3 * CATALOG_MAX_AGE_MS,
      catalog: catalog('Eski'),
    });
    mockFetch.mockRejectedValue(new Error('offline'));
    expect((await loadCatalog(NOW)).cities[0]?.names.tr).toBe('Eski');
  });

  it('fails when there is neither a server nor a kept catalog', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    await expect(loadCatalog(NOW)).rejects.toThrow('offline');
  });

  it('ignores a damaged or empty kept catalog', async () => {
    mockFetch.mockResolvedValue(catalog('Sunucu'));
    for (const json of [
      '{not json',
      JSON.stringify({ savedAt: NOW, catalog: { cities: [], sports: [] } }),
    ]) {
      mockStore.json = json;
      expect((await loadCatalog(NOW)).cities[0]?.names.tr).toBe('Sunucu');
    }
  });
});
