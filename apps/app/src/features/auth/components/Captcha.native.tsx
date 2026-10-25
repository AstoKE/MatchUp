import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as z from 'zod/mini';
import { env } from '@/lib/env';
import { Button, Text, useTheme } from '@/ui';
import {
  TURNSTILE_ORIGIN,
  TURNSTILE_SCRIPT,
  turnstileOptions,
  type CaptchaProps,
} from './captcha-shared';

/**
 * Native: Turnstile has no native SDK, so the widget runs in a WebView whose page is served under the
 * app's web origin (Turnstile checks the hostname against the site key's allowed domains). The page
 * only posts {token} / {expired} / {error} messages back; navigation away from it is refused.
 */

const message = z.union([
  z.object({ token: z.string().check(z.minLength(1), z.maxLength(4096)) }),
  z.object({ expired: z.literal(true) }),
  z.object({ error: z.literal(true) }),
]);

function page(options: ReturnType<typeof turnstileOptions>): string {
  const json = JSON.stringify(options).replaceAll('<', '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body><div id="w"></div><script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function start(){try{var o=${json};
o.callback=function(t){post({token:t});};
o['expired-callback']=function(){post({expired:true});};
o['error-callback']=function(){post({error:true});};
turnstile.render('#w',o);}catch(e){post({error:true});}}
</script><script src="${TURNSTILE_SCRIPT}&onload=start" async defer onerror="post({error:true})"></script>
</body></html>`;
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const html = useMemo(
    () => page(turnstileOptions({ siteKey, language, theme })),
    [siteKey, language, theme],
  );
  const base = env.EXPO_PUBLIC_WEB_URL;

  const onMessage = (event: WebViewMessageEvent) => {
    let parsed: z.infer<typeof message>;
    try {
      parsed = message.parse(JSON.parse(event.nativeEvent.data));
    } catch {
      return; // ignore anything that is not our protocol
    }
    if ('token' in parsed) onToken(parsed.token);
    else {
      onToken(null);
      if ('error' in parsed) setFailed(true);
    }
  };

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
    <View accessibilityLabel={label} testID="captcha" style={{ height: 72, width: '100%' }}>
      <WebView
        key={attempt}
        source={{ html, baseUrl: base }}
        originWhitelist={[base, TURNSTILE_ORIGIN, 'about:blank']}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url;
          if (url === 'about:blank' || url.startsWith(base) || url.startsWith(TURNSTILE_ORIGIN)) {
            return true;
          }
          // e.g. Cloudflare's privacy link: open outside the app, never inside the challenge view.
          if (url.startsWith('https://')) void Linking.openURL(url);
          return false;
        }}
        onMessage={onMessage}
        onError={() => {
          onToken(null);
          setFailed(true);
        }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
        scrollEnabled={false}
        style={{ backgroundColor: 'transparent' }}
      />
    </View>
  );
}
