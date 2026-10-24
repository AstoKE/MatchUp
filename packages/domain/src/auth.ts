import { z } from 'zod';

/** Auth input rules. The server (Supabase Auth config) enforces the same minimums. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt limit used by Supabase Auth

export const emailSchema = z.string().trim().toLowerCase().min(3).max(254).pipe(z.email());

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  // No minimum on sign-in: do not reveal the password policy to attackers.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const resetRequestSchema = z.object({ email: emailSchema });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
