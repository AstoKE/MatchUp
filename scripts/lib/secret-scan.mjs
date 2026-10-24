// Detects privileged credentials that must never appear in client build output (SECURITY §6).
// Pure functions so they can be unit-tested; scripts/check-bundle-secrets.mjs does the file I/O.

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
const PRIVILEGED_ROLES = new Set(['service_role', 'supabase_admin', 'postgres']);

function decodePayload(token) {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Returns findings as `{ kind, sample }` where `sample` is masked and never the full secret. */
export function findSecrets(text) {
  const findings = [];

  for (const match of text.matchAll(JWT)) {
    const payload = decodePayload(match[0]);
    if (payload && PRIVILEGED_ROLES.has(payload.role)) {
      findings.push({
        kind: `JWT with privileged role "${payload.role}"`,
        sample: `${match[0].slice(0, 12)}…`,
      });
    }
  }
  for (const match of text.matchAll(/sb_secret_[A-Za-z0-9_-]{8,}/g)) {
    findings.push({ kind: 'Supabase secret key', sample: `${match[0].slice(0, 12)}…` });
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(text)) {
    findings.push({ kind: 'PEM private key', sample: '-----BEGIN … PRIVATE KEY-----' });
  }
  for (const match of text.matchAll(/\bAKIA[0-9A-Z]{16}\b/g)) {
    findings.push({ kind: 'AWS access key id', sample: `${match[0].slice(0, 8)}…` });
  }
  return findings;
}
