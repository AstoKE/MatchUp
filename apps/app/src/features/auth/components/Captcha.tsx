import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { Button, Text, useTheme } from '@/ui';
import { TURNSTILE_SCRIPT, turnstileOptions, type CaptchaProps } from './captcha-shared';

/** Web: the Turnstile widget rendered into a DOM node. Native uses Captcha.native.tsx. */

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  const existing = (window as { turnstile?: TurnstileApi }).turnstile;
  if (existing) return Promise.resolve(existing);
  scriptLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => {
      const api = (window as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('turnstile missing'));
    };
    script.onerror = () => reject(new Error('turnstile load failed'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptLoad = null; // allow a retry
    throw error;
  });
  return scriptLoad;
}

export function Captcha({
  siteKey,
  onToken,
  language,
  theme,
  label,
  loadFailedText,
  retryLabel,
}: CaptchaProps) {
  const { spacing } = useTheme();
  // On RN Web a host View's ref is its DOM element.
  const host = useRef<ComponentRef<typeof View>>(null);
  // The widget lives across renders; its callbacks must reach the latest onToken.
  const latestOnToken = useRef(onToken);
  useEffect(() => {
    latestOnToken.current = onToken;
  });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    const emit = (token: string | null) => latestOnToken.current(token);
    loadTurnstile()
      .then((api) => {
        const el = host.current as unknown as HTMLElement | null;
        if (cancelled || !el) return;
        widgetId = api.render(el, {
          ...turnstileOptions({ siteKey, language, theme }),
          callback: (token: string) => emit(token),
          'expired-callback': () => emit(null),
          'error-callback': () => {
            emit(null);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      emit(null);
      if (widgetId) (window as { turnstile?: TurnstileApi }).turnstile?.remove(widgetId);
    };
  }, [siteKey, language, theme, attempt]);

  if (failed) {
    return (
      <View style={{ gap: spacing[2] }}>
        <Text tone="secondary">{loadFailedText}</Text>
        <Button
          variant="secondary"
          label={retryLabel}
          onPress={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      </View>
    );
  }
  return (
    <View
      ref={host}
      role="group"
      aria-label={label}
      testID="captcha"
      style={{ minHeight: 65, width: '100%' }}
    />
  );
}
