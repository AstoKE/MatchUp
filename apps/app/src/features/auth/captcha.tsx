import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { env } from '@/lib/env';
import { Text, useTheme } from '@/ui';
import { Captcha } from './components/Captcha';

/**
 * CAPTCHA state for one auth form. Off (no widget, no token) unless EXPO_PUBLIC_TURNSTILE_SITE_KEY is
 * set, which must match the Supabase project's Auth CAPTCHA setting. The server is the enforcer;
 * this only collects a token. Tokens are single-use, so every attempt needs a fresh one.
 */
export function useCaptcha() {
  const siteKey = env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  const { t, i18n } = useTranslation(['auth', 'common']);
  const { scheme, spacing } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [missing, setMissing] = useState(false);

  const widget = siteKey ? (
    <View style={{ gap: spacing[1] }}>
      <Captcha
        key={generation}
        siteKey={siteKey}
        onToken={(next) => {
          setToken(next);
          if (next) setMissing(false);
        }}
        language={i18n.language.startsWith('en') ? 'en' : 'tr'}
        theme={scheme}
        label={t('auth:captcha.label')}
        loadFailedText={t('auth:captcha.loadFailed')}
        retryLabel={t('common:retry')}
      />
      {missing ? (
        <Text variant="bodySm" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {t('auth:captcha.required')}
        </Text>
      ) : null}
    </View>
  ) : null;

  return {
    widget,
    /**
     * The extra fields for one submit: `{}` when CAPTCHA is off, `{ captchaToken }` when solved, or
     * null (and an inline message) when it is on but not solved yet — then do not submit.
     */
    take(): { captchaToken?: string } | null {
      if (!siteKey) return {};
      if (!token) {
        setMissing(true);
        return null;
      }
      return { captchaToken: token };
    },
    /** Call after every attempt, success or failure: the token was consumed by the server. */
    reset() {
      if (!siteKey) return;
      setToken(null);
      setGeneration((n) => n + 1);
    },
  };
}
