import * as ExpoCrypto from 'expo-crypto';

/**
 * Hermes (React Native) has no global `crypto`. supabase-js then silently weakens PKCE: the code
 * verifier comes from Math.random() and the challenge method falls back to `plain` instead of S256.
 * This supplies the two pieces it uses — `getRandomValues` (OS CSPRNG) and `subtle.digest` — from
 * expo-crypto. It never overrides an existing implementation (web, tests).
 */
type Algorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

const ALGORITHMS: Record<Algorithm, ExpoCrypto.CryptoDigestAlgorithm> = {
  'SHA-1': ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  'SHA-256': ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  'SHA-512': ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

type Impl = Pick<typeof ExpoCrypto, 'getRandomValues' | 'digest'>;

function digest(impl: Impl, algorithm: string | { name: string }, data: BufferSource) {
  const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
  const mapped = ALGORITHMS[name as Algorithm];
  if (!mapped) return Promise.reject(new Error(`Unsupported digest algorithm: ${name}`));
  return impl.digest(mapped, data);
}

export function installCryptoPolyfill(
  target: { crypto?: unknown } = globalThis,
  impl: Impl = ExpoCrypto,
): void {
  const existing = target.crypto as { getRandomValues?: unknown; subtle?: unknown } | undefined;
  if (existing?.getRandomValues && existing.subtle) return;
  target.crypto = {
    ...existing,
    getRandomValues: existing?.getRandomValues ?? impl.getRandomValues,
    subtle: {
      digest: (algorithm: string | { name: string }, data: BufferSource) =>
        digest(impl, algorithm, data),
    },
  };
}

installCryptoPolyfill();
