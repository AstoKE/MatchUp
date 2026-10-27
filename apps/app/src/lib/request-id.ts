/**
 * Random UUID v4 for idempotent writes (`client_request_id`): generated once per form, reused on
 * retry so a lost response cannot create a second record. Uses the platform CSPRNG (web/tests) or
 * the expo-crypto polyfill installed with the Supabase client (native).
 */
export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
