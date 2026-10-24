import { createChunkedStorage, type AsyncKeyValueStore } from './chunked-storage';

function memoryStore() {
  const data = new Map<string, string>();
  const store: AsyncKeyValueStore = {
    getItemAsync: (key) => Promise.resolve(data.get(key) ?? null),
    setItemAsync: (key, value) => {
      // Mimic the real store's key rules and size limit so tests fail if we ever violate them.
      if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid SecureStore key: ${key}`);
      if (new TextEncoder().encode(value).length > 2048)
        throw new Error('value exceeds 2048 bytes');
      data.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
  return { store, data };
}

describe('chunked secure storage', () => {
  it('round-trips a small value', async () => {
    const { store } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('sb-local-auth-token', '{"a":1}');
    expect(await storage.getItem('sb-local-auth-token')).toBe('{"a":1}');
  });

  it('round-trips a session-sized value across many chunks within the size limit', async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedStorage(store);
    const session = JSON.stringify({
      access_token: 'a'.repeat(1500),
      refresh_token: 'r'.repeat(300),
      user: { email: 'ü'.repeat(200) },
    });
    await storage.setItem('sb:auth/token', session); // unsafe characters in the key are sanitized
    expect(await storage.getItem('sb:auth/token')).toBe(session);
    expect(data.size).toBeGreaterThan(3);
  });

  it('handles 4-byte UTF-8 characters without exceeding the byte limit', async () => {
    const { store } = memoryStore();
    const storage = createChunkedStorage(store);
    const emoji = '😀'.repeat(2000);
    await storage.setItem('k', emoji);
    expect(await storage.getItem('k')).toBe(emoji);
  });

  it('removes stale chunks when the value shrinks', async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'x'.repeat(3000));
    const before = data.size;
    await storage.setItem('k', 'short');
    expect(await storage.getItem('k')).toBe('short');
    expect(data.size).toBeLessThan(before);
    expect(data.size).toBe(2); // one chunk + the count
  });

  it('removeItem deletes every chunk and the count', async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'x'.repeat(2000));
    await storage.removeItem('k');
    expect(data.size).toBe(0);
    expect(await storage.getItem('k')).toBeNull();
  });

  it('returns null for unknown keys', async () => {
    const storage = createChunkedStorage(memoryStore().store);
    expect(await storage.getItem('nope')).toBeNull();
  });

  it('treats a missing chunk as a corrupt session: signed out, and cleans up', async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'x'.repeat(2000));
    data.delete('k.1');
    expect(await storage.getItem('k')).toBeNull();
    expect(data.size).toBe(0);
  });

  it('ignores a garbage item count', async () => {
    const { store, data } = memoryStore();
    data.set('k.n', 'NaN');
    expect(await createChunkedStorage(store).getItem('k')).toBeNull();
    data.set('k.n', '999999');
    expect(await createChunkedStorage(store).getItem('k')).toBeNull();
  });
});
