import * as z from 'zod/mini';

/**
 * Auth input rules. The server (Supabase Auth config) enforces the same minimums.
 * Validation messages are STABLE KEYS (not prose) so the UI can localize them.
 *
 * `zod/mini` (function-style API) instead of classic zod: same validation, a fraction of the bundle
 * (docs/PERFORMANCE.md).
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt limit used by Supabase Auth

export const AUTH_VALIDATION_KEYS = [
  'EMAIL_INVALID',
  'PASSWORD_REQUIRED',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
] as const;
export type AuthValidationKey = (typeof AUTH_VALIDATION_KEYS)[number];

export function isAuthValidationKey(value: unknown): value is AuthValidationKey {
  return typeof value === 'string' && (AUTH_VALIDATION_KEYS as readonly string[]).includes(value);
}

export const emailSchema = z.pipe(
  z.string().check(z.trim(), z.toLowerCase(), z.maxLength(254, 'EMAIL_INVALID')),
  z.email('EMAIL_INVALID'),
);

export const passwordSchema = z
  .string()
  .check(
    z.minLength(PASSWORD_MIN_LENGTH, 'PASSWORD_TOO_SHORT'),
    z.maxLength(PASSWORD_MAX_LENGTH, 'PASSWORD_TOO_LONG'),
  );

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  // No minimum on sign-in: do not reveal the password policy to attackers.
  password: z
    .string()
    .check(
      z.minLength(1, 'PASSWORD_REQUIRED'),
      z.maxLength(PASSWORD_MAX_LENGTH, 'PASSWORD_TOO_LONG'),
    ),
});

export const resetRequestSchema = z.object({ email: emailSchema });
export const newPasswordSchema = z.object({ password: passwordSchema });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
