/**
 * Supabase Auth returns the TOTP QR code as `data:image/svg+xml;utf-8,<svg ...>` with the SVG unencoded. Browsers stop a
 * URL at characters such as `#`, and React Native Web paints images as a CSS `url("...")` that the SVG's quotes break:
 * the QR showed nothing (2026-11-13). Percent-encoding the SVG makes one safe URI for both.
 */
export function qrDataUri(raw: string): string {
  const comma = raw.indexOf(',');
  if (!raw.startsWith('data:image/svg+xml') || comma < 0) return raw;
  const head = raw.slice(0, comma);
  if (head.includes(';base64')) return raw;
  const body = raw.slice(comma + 1);
  // Already percent-encoded: leave it alone (decoding first would also accept it, but this keeps the value as given).
  if (!body.trimStart().startsWith('<')) return raw;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
}
