import {
  type NewPasswordInput,
  type ResetRequestInput,
  type SignInInput,
  type SignUpInput,
} from '@matchup/domain';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { env } from '@/lib/env';
import { log } from '@/lib/observability';
import { runBeforeSignOut } from '@/lib/before-sign-out';
import { supabase } from '@/lib/supabase/client';
import { AuthFlowError, classifyAuthError, isAlreadyRegistered } from './classify-auth-error';

/** Re-exported so the rest of the feature never imports the Supabase package directly. */
export type AuthSession = Session;

/**
 * Where email links (verify / recover) send the user back to. Must be in config.toml's allow-list.
 * `next` is an allow-listed destination consumed by the callback screen (see sanitizeCallbackNext).
 */
function callbackUrl(next?: '/reset-password'): string {
  if (Platform.OS === 'web') {
    const base = `${env.EXPO_PUBLIC_WEB_URL}/auth/callback`;
    return next ? `${base}?next=${encodeURIComponent(next)}` : base;
  }
  return Linking.createURL('auth/callback', next ? { queryParams: { next } } : {});
}

function fail(error: unknown): never {
  const failure = classifyAuthError(error as Parameters<typeof classifyAuthError>[0]);
  if (failure === 'UNKNOWN') {
    // Only stable identifiers are logged — never the server's message text.
    const { code, status } = (error ?? {}) as { code?: string; status?: number };
    log.warn('auth', 'UNCLASSIFIED_AUTH_ERROR', { code, status });
  }
  throw new AuthFlowError(failure, { cause: error });
}

/**
 * A one-time CAPTCHA token (Cloudflare Turnstile) for the endpoints Supabase protects when the
 * project's Auth CAPTCHA is on. Undefined when CAPTCHA is off (EXPO_PUBLIC_TURNSTILE_SITE_KEY empty).
 */
export interface WithCaptcha {
  captchaToken?: string | undefined;
}

/**
 * Sign-up is enumeration-safe: with email confirmation enabled, Supabase answers identically for
 * new and already-registered addresses, and the UI always shows "check your email".
 */
export async function signUpWithEmail(input: SignUpInput & WithCaptcha): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: callbackUrl(), captchaToken: input.captchaToken },
  });
  // "Already registered" must look exactly like success to the user (no account enumeration in the UI).
  if (error && !isAlreadyRegistered(error)) fail(error);
}

export async function resendVerificationEmail(
  input: { email: string } & WithCaptcha,
): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: input.email,
    options: { emailRedirectTo: callbackUrl(), captchaToken: input.captchaToken },
  });
  if (error) fail(error);
}

export async function signInWithEmail(input: SignInInput & WithCaptcha): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
    options: { captchaToken: input.captchaToken },
  });
  if (error) fail(error);
}

/** Signs out THIS device (local scope); other sessions stay valid. */
export async function signOut(): Promise<void> {
  await runBeforeSignOut();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) fail(error);
}

/**
 * Phase 8 (ADR-0029): the phone as a second check on the account. `requestPhoneCode` asks Auth to text a code to the
 * number (Auth's own phone change); `verifyPhoneCode` confirms it. The number must already be normalized (+905…).
 */
export async function requestPhoneCode(phone: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) fail(error);
}

export async function verifyPhoneCode(phone: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'phone_change' });
  if (error) fail(error);
}

export async function requestPasswordReset(input: ResetRequestInput & WithCaptcha): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: callbackUrl('/reset-password'),
    captchaToken: input.captchaToken,
  });
  // The UI always says "if an account exists…", so only transport/rate errors are surfaced.
  if (error) fail(error);
}

export async function updatePassword(input: NewPasswordInput): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) fail(error);
}

/** Native deep-link landing: exchange the PKCE code from the email link for a session. */
export async function exchangeCode(code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) fail(error);
}

export async function getInitialSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'OTHER';

/** Subscribes to session changes; returns an unsubscribe function. Callbacks must stay synchronous. */
export function subscribeToSession(
  listener: (event: AuthEvent, session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const mapped: AuthEvent =
      event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY'
        ? event
        : 'OTHER';
    listener(mapped, session);
  });
  return () => data.subscription.unsubscribe();
}
