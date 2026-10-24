import { z } from 'zod';

/**
 * Auth input rules. The server (Supabase Auth config) enforces the same minimums.
 * Validation messages are STABLE KEYS (not prose) so the UI can localize them.
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

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'EMAIL_INVALID')
  .pipe(z.email('EMAIL_INVALID'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'PASSWORD_TOO_SHORT')
  .max(PASSWORD_MAX_LENGTH, 'PASSWORD_TOO_LONG');

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  // No minimum on sign-in: do not reveal the password policy to attackers.
  password: z.string().min(1, 'PASSWORD_REQUIRED').max(PASSWORD_MAX_LENGTH, 'PASSWORD_TOO_LONG'),
});

export const resetRequestSchema = z.object({ email: emailSchema });
export const newPasswordSchema = z.object({ password: passwordSchema });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
