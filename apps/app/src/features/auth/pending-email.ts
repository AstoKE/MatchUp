/**
 * The address a verification email was just sent to, kept ONLY in memory for the "check your email"
 * screen. It is deliberately not put in the URL (browser history/logs) or persisted storage (PII).
 * After a reload it is gone and the screen asks for the address again.
 */
let pendingEmail: string | null = null;

export function setPendingEmail(email: string | null): void {
  pendingEmail = email;
}

export function getPendingEmail(): string | null {
  return pendingEmail;
}
