/**
 * Phase 8 (ADR-0029): Turkish mobile numbers only. Accepts what people type ("0532 123 45 67", "532 1234567",
 * "+90 (532) 123-45-67", "905321234567") and returns the E.164 form Auth expects, or null. The database accepts the same
 * set (private.phone_verified: 905 and nine digits).
 */
export function normalizeTurkishMobile(input: string): string | null {
  const digits = input.replace(/[\s()+\-.]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const national = digits.startsWith('90')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  return /^5\d{9}$/.test(national) ? `+90${national}` : null;
}

/** "+905321234567" → "+90 532 *** ** 67": enough for the owner to recognise it, nothing more. */
export function maskTurkishMobile(e164: string): string {
  const national = e164.replace(/^\+?90/, '');
  return `+90 ${national.slice(0, 3)} *** ** ${national.slice(-2)}`;
}
