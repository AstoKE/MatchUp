import {
  displayNameSchema,
  onboardingSchema,
  type OnboardingInput,
  type SportSelection,
} from '@matchup/domain';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RequireAuth, sanitizeReturnTo, useSession } from '@/features/auth';
import { LocationFields, SportPicker, useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { profileValidationMessage } from '@/lib/profile-validation';
import { Banner, Button, EmptyState, Screen, Text, TextField, useTheme } from '@/ui';
import { useCompleteOnboarding, useLegalVersions, useMyAccount } from '../hooks';
import { ConsentStep, type ConsentDraft } from '../components/ConsentStep';

const STEPS = 3;

interface Draft extends ConsentDraft {
  displayName: string;
  cityId: string | null;
  districtId: string | null;
  sports: SportSelection[];
}

const initialDraft: Draft = {
  adult: false,
  terms: false,
  marketing: false,
  displayName: '',
  cityId: null,
  districtId: null,
  sports: [],
};

/** Never send the user back into the flow they just finished. */
function destination(returnTo: string): string {
  return returnTo.startsWith('/onboarding') || returnTo.startsWith('/legal') ? '/' : returnTo;
}

export function OnboardingScreen() {
  return (
    <RequireAuth>
      <Flow />
    </RequireAuth>
  );
}

function Flow() {
  const { t } = useTranslation(['onboarding', 'profile', 'common']);
  const { spacing, colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const session = useSession();
  const account = useMyAccount();
  const catalog = useCatalog();
  const legal = useLegalVersions();
  const complete = useCompleteOnboarding();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const returnTo = destination(sanitizeReturnTo(params.returnTo));

  if (account.data?.onboarded) return <Redirect href={returnTo as '/'} />;

  if (session.status === 'authenticated' && !session.emailVerified) {
    return (
      <Screen maxWidth={560}>
        <EmptyState
          title={t('onboarding:verifyFirstTitle')}
          body={t('onboarding:verifyFirstBody')}
        />
      </Screen>
    );
  }

  if (account.isPending || catalog.isPending || legal.isPending) {
    return (
      <Screen maxWidth={560}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  const loadError = account.error ?? catalog.error ?? legal.error;
  if (loadError || !catalog.data || !legal.data) {
    return (
      <Screen maxWidth={560}>
        <EmptyState
          title={t('onboarding:loadFailed')}
          body={errorText(loadError)}
          actionLabel={t('common:retry')}
          onAction={() => {
            void account.refetch();
            void catalog.refetch();
            void legal.refetch();
          }}
        />
      </Screen>
    );
  }

  const versions = legal.data;

  const validateStep = (index: number): Record<string, string> => {
    const found: Record<string, string> = {};
    if (index === 0) {
      if (!draft.adult) found.adult = 'ADULT_REQUIRED';
      if (!draft.terms) found.terms = 'TERMS_REQUIRED';
    } else if (index === 1) {
      const name = displayNameSchema.safeParse(draft.displayName);
      if (!name.success) found.displayName = name.error.issues[0]?.message ?? 'NAME_INVALID';
      if (draft.districtId && !draft.cityId) found.district = 'DISTRICT_NEEDS_CITY';
    } else {
      const all = onboardingSchema.safeParse(toInput(draft));
      if (!all.success) {
        for (const issue of all.error.issues) {
          const key = issue.path[0] === 'sports' ? 'sports' : String(issue.path[0] ?? 'form');
          found[key] ??= issue.message;
        }
      }
    }
    return found;
  };

  const next = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (step < STEPS - 1) {
      setStep(step + 1);
      return;
    }
    const parsed = onboardingSchema.safeParse(toInput(draft));
    if (!parsed.success) return;
    setSubmitError(null);
    complete.mutate(
      { input: parsed.data, versions },
      {
        onSuccess: () => router.replace(returnTo as '/'),
        onError: (error) => {
          setSubmitError(errorText(error));
          // The server moved to new legal versions while the form was open: fetch them for the retry.
          void legal.refetch();
        },
      },
    );
  };

  const message = (key: string | undefined) => profileValidationMessage(key) ?? undefined;

  /** Applies a change and drops the errors it may have fixed, so stale messages never linger. */
  const edit = (patch: Partial<Draft>, ...fixes: string[]) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (fixes.length > 0) {
      setErrors((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => !fixes.includes(key))),
      );
    }
  };

  return (
    <Screen maxWidth={560}>
      <View style={{ gap: spacing[2] }}>
        <Text variant="caption" tone="secondary">
          {t('onboarding:stepOf', { current: step + 1, total: STEPS })}
        </Text>
        <Text variant="headline" heading={1}>
          {t('onboarding:title')}
        </Text>
      </View>

      {submitError ? <Banner kind="danger" message={submitError} /> : null}

      {step === 0 ? (
        <ConsentStep
          value={draft}
          onChange={(consent) => edit(consent, 'adult', 'terms')}
          errors={{ adult: message(errors.adult), terms: message(errors.terms) }}
          draftNotice={versions.draft}
        />
      ) : null}

      {step === 1 ? (
        <View style={{ gap: spacing[4] }}>
          <Text variant="title" heading={2}>
            {t('onboarding:basics.title')}
          </Text>
          <TextField
            label={t('profile:displayName')}
            hint={t('profile:displayNameHint')}
            value={draft.displayName}
            onChangeText={(displayName) => edit({ displayName }, 'displayName')}
            error={message(errors.displayName)}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            returnKeyType="next"
          />
          <LocationFields
            cities={catalog.data.cities}
            cityId={draft.cityId}
            districtId={draft.districtId}
            onChange={(location) => edit(location, 'district')}
            districtError={message(errors.district)}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: spacing[3] }}>
          <Text variant="title" heading={2}>
            {t('onboarding:sports.title')}
          </Text>
          <Text tone="secondary">{t('onboarding:sports.intro')}</Text>
          <Text variant="caption" tone="secondary">
            {t('profile:levelNote')}
          </Text>
          {errors.sports ? <Banner kind="danger" message={message(errors.sports) ?? ''} /> : null}
          <SportPicker
            sports={catalog.data.sports}
            value={draft.sports}
            onChange={(sports) => edit({ sports }, 'sports')}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' }}>
        {step > 0 ? (
          <Button
            variant="secondary"
            label={t('onboarding:back')}
            onPress={() => {
              setErrors({});
              setStep(step - 1);
            }}
          />
        ) : (
          <View />
        )}
        <Button
          label={step === STEPS - 1 ? t('onboarding:finish') : t('onboarding:next')}
          loading={complete.isPending}
          loadingLabel={t('onboarding:finishing')}
          onPress={next}
        />
      </View>
    </Screen>
  );
}

function toInput(draft: Draft): OnboardingInput {
  return {
    adultConfirmed: draft.adult as true,
    termsAccepted: draft.terms as true,
    marketingConsent: draft.marketing,
    displayName: draft.displayName,
    cityId: draft.cityId,
    districtId: draft.districtId,
    sports: draft.sports,
  };
}
