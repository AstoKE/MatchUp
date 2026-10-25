import { installCryptoPolyfill } from './crypto-polyfill';

// Stand-in for the native module: the test runtime's own WebCrypto, so the digest is real.
// expo-crypto's algorithm enum values are the WebCrypto names ('SHA-256', …).
const stubImpl = {
  getRandomValues: <T>(array: T) => array,
  digest: (algorithm: string, data: BufferSource) =>
    globalThis.crypto.subtle.digest(algorithm, data),
};

type FakeCrypto = {
  getRandomValues: unknown;
  subtle: { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> };
};

function base64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('crypto polyfill', () => {
  it('installs subtle.digest and getRandomValues when the runtime has no crypto', async () => {
    const target: { crypto?: unknown } = {};
    installCryptoPolyfill(target, stubImpl as never);
    const crypto = target.crypto as FakeCrypto;
    expect(crypto.getRandomValues).toBe(stubImpl.getRandomValues);
    // RFC 7636 appendix B: the S256 challenge of this verifier is a published value.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(base64Url(hash)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('rejects algorithms it does not support', async () => {
    const target: { crypto?: unknown } = {};
    installCryptoPolyfill(target, stubImpl as never);
    await expect(
      (target.crypto as FakeCrypto).subtle.digest('MD5', new Uint8Array(1)),
    ).rejects.toThrow(/Unsupported/);
  });

  it('never replaces a complete existing implementation', () => {
    const existing = { getRandomValues: jest.fn(), subtle: { digest: jest.fn() } };
    const target = { crypto: existing };
    installCryptoPolyfill(target, stubImpl as never);
    expect(target.crypto).toBe(existing);
  });
});
