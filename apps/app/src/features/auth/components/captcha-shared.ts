/** Cloudflare Turnstile, loaded only when a site key is configured (docs/AUTH_ABUSE.md §5). */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

export interface CaptchaProps {
  siteKey: string;
  /** A fresh one-time token, or null when it expired / failed / was reset. */
  onToken: (token: string | null) => void;
  language: 'tr' | 'en';
  theme: 'light' | 'dark';
  /** Accessible name of the widget region. */
  label: string;
  /** Shown with a retry button when the challenge cannot load (offline, blocked script). */
  loadFailedText: string;
  retryLabel: string;
}

/** Widget options shared by web and the native WebView page. */
export function turnstileOptions(props: Pick<CaptchaProps, 'siteKey' | 'language' | 'theme'>) {
  return {
    sitekey: props.siteKey,
    language: props.language,
    theme: props.theme,
    size: 'flexible',
    // Tokens are single-use and expire after ~300 s; the app asks for a new one instead.
    'refresh-expired': 'manual',
  } as const;
}
