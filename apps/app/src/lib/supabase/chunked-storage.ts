/**
 * Session storage for native platforms, backed by the OS keystore (expo-secure-store).
 *
 * Why chunking: SecureStore values are size-limited (~2 KB per item recommended), while a Supabase
 * session (access + refresh token + user) is larger. We split the serialized session into small
 * pieces; the item count is written last, so a crash mid-write never yields a half-valid session.
 * Chunks are measured in characters but kept small enough that even 4-byte UTF-8 characters stay
 * under the limit.
 */
export interface AsyncKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface SupportedAsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const DEFAULT_CHUNK_CHARS = 480;

/** SecureStore keys may only contain alphanumerics, ".", "-" and "_". */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createChunkedStorage(
  store: AsyncKeyValueStore,
  chunkChars: number = DEFAULT_CHUNK_CHARS,
): SupportedAsyncStorage {
  const countKey = (key: string) => `${safeKey(key)}.n`;
  const chunkKey = (key: string, index: number) => `${safeKey(key)}.${index}`;

  async function readCount(key: string): Promise<number> {
    const raw = await store.getItemAsync(countKey(key));
    const count = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isInteger(count) && count > 0 && count < 1000 ? count : 0;
  }

  async function removeChunks(key: string, count: number): Promise<void> {
    await Promise.all(
      Array.from({ length: count }, (_, index) => store.deleteItemAsync(chunkKey(key, index))),
    );
  }

  return {
    async getItem(key) {
      const count = await readCount(key);
      if (count === 0) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await store.getItemAsync(chunkKey(key, index));
        // A missing chunk means a corrupted/partial session: treat as signed out and clean up.
        if (part === null) {
          await this.removeItem(key);
          return null;
        }
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const previous = await readCount(key);
      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += chunkChars) {
        chunks.push(value.slice(offset, offset + chunkChars));
      }
      for (let index = 0; index < chunks.length; index += 1) {
        await store.setItemAsync(chunkKey(key, index), chunks[index] ?? '');
      }
      await store.setItemAsync(countKey(key), String(chunks.length));
      // Remove leftovers when the new value is shorter than the old one.
      if (previous > chunks.length) {
        await Promise.all(
          Array.from({ length: previous - chunks.length }, (_, i) =>
            store.deleteItemAsync(chunkKey(key, chunks.length + i)),
          ),
        );
      }
    },

    async removeItem(key) {
      const count = await readCount(key);
      await store.deleteItemAsync(countKey(key));
      await removeChunks(key, count);
    },
  };
}
