import { maskTurkishMobile, normalizeTurkishMobile } from '@matchup/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  authErrorText,
  requestPhoneCode,
  RequireAuth,
  sanitizeReturnTo,
  verifyPhoneCode,
} from '@/features/auth';
import { Banner, Button, Screen, Text, TextField, useTheme, useToast } from '@/ui';
import { destination } from '../destination';

const RESEND_SECONDS = 60;

/**
 * Phase 8 (ADR-0029): a Turkish mobile number, confirmed by a texted code, keeps one account per person. Reached from the
 * gate (when the server requires it) and from Settings. Signed in is enough: it never waits for anything else.
 */
export function VerifyPhoneScreen() {
  return (
    <RequireAuth>
      <VerifyPhone />
    </RequireAuth>
  );
}

function VerifyPhone() {
  const { t } = useTranslation(['auth', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = destination(sanitizeReturnTo(params.returnTo));

  const [typed, setTyped] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = (number: string) => {
    setError(null);
    setBusy(true);
    requestPhoneCode(number)
      .then(() => {
        setSentTo(number);
        setCode('');
        setWait(RESEND_SECONDS);
      })
      .catch((e: unknown) => setError(authErrorText(e)))
      .finally(() => setBusy(false));
  };

  const submitNumber = () => {
    const number = normalizeTurkishMobile(typed);
    if (!number) {
      setFieldError(t('auth:phone.invalid'));
      return;
    }
    setFieldError(null);
    send(number);
  };

  const submitCode = () => {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) {
      setFieldError(t('auth:phone.codeInvalidFormat'));
      return;
    }
    setFieldError(null);
    setError(null);
    setBusy(true);
    verifyPhoneCode(sentTo, code)
      .then(async () => {
        // The account (and its phone flag) is re-read; the session updates itself from Auth.
        await queryClient.invalidateQueries({ queryKey: ['account'] });
        toast.show(t('auth:phone.verified'), 'success');
        // Back to the screen that sent the person here if it is still in the stack, otherwise open it.
        router.dismissTo(returnTo as '/');
      })
      .catch((e: unknown) => setError(authErrorText(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Screen maxWidth={560}>
      <View style={{ gap: spacing[2] }}>
        <Text variant="headline" heading={1}>
          {t('auth:phone.title')}
        </Text>
        <Text tone="secondary">{t('auth:phone.intro')}</Text>
      </View>
      {error ? <Banner kind="danger" message={error} /> : null}

      {sentTo === null ? (
        <View style={{ gap: spacing[3] }}>
          <TextField
            label={t('auth:phone.number')}
            hint={t('auth:phone.numberHint')}
            value={typed}
            onChangeText={(value) => {
              setTyped(value);
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
            inputMode="tel"
            autoComplete="tel-national"
            textContentType="telephoneNumber"
            maxLength={20}
          />
          <Button
            label={t('auth:phone.send')}
            fullWidth
            loading={busy}
            loadingLabel={t('common:loading')}
            onPress={submitNumber}
          />
        </View>
      ) : (
        <View style={{ gap: spacing[3] }}>
          <Text accessibilityLiveRegion="polite">
            {t('auth:phone.sentTo', { number: maskTurkishMobile(sentTo) })}
          </Text>
          <TextField
            label={t('auth:phone.code')}
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, '').slice(0, 6));
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
            inputMode="numeric"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button
            label={t('auth:phone.verify')}
            fullWidth
            loading={busy}
            loadingLabel={t('common:loading')}
            onPress={submitCode}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Button
              variant="tertiary"
              label={
                wait > 0 ? t('auth:phone.resendIn', { seconds: wait }) : t('auth:phone.resend')
              }
              disabled={wait > 0 || busy}
              onPress={() => send(sentTo)}
            />
            <Button
              variant="tertiary"
              label={t('auth:phone.changeNumber')}
              disabled={busy}
              onPress={() => {
                setSentTo(null);
                setCode('');
                setError(null);
              }}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}
