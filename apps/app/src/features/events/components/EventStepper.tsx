import { validateEventDraft, type EventDraft, type EventDraftErrors } from '@matchup/domain';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Catalog } from '@/features/catalog';
import { Banner, Button, Screen, Text, useTheme } from '@/ui';
import { pick } from '../draft';
import { EVENT_FORM_STEPS, EventForm, STEP_FIELDS } from './EventForm';

export type StepperSubmit = (draft: EventDraft, timeZone: string, publish: boolean) => void;

/**
 * The three-step event form shared by "create" and "edit". Each step validates only its own fields;
 * the final submit validates everything and returns to the first step with a problem. The server
 * validates again (it is the authority); its errors arrive as `submitError`.
 */
export function EventStepper({
  catalog,
  initial,
  title,
  locked,
  publishOnSaveIf,
  submitError,
  busy,
  mode,
  onSubmit,
}: {
  catalog: Catalog;
  initial: EventDraft;
  title: string;
  locked: boolean;
  /** Edit mode: whether the lead-time rule applies to this save (published event, start moved). */
  publishOnSaveIf?: (draft: EventDraft) => boolean;
  submitError: string | null;
  busy: 'draft' | 'publish' | 'save' | null;
  mode: 'create' | 'edit';
  onSubmit: StepperSubmit;
}) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<EventDraftErrors>({});

  const format = catalog.sports
    .find((s) => s.id === draft.sportId)
    ?.formats.find((f) => f.id === draft.formatId);
  const city = catalog.cities.find((c) => c.id === draft.cityId) ?? catalog.cities[0];
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';

  const validate = (publishing: boolean) =>
    validateEventDraft(draft, {
      format: format ? { min: format.minParticipants, max: format.maxParticipants } : null,
      timeZone,
      now: new Date(),
      publishing,
    });

  const change = (patch: Partial<EventDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    // Drop errors of the fields that just changed, so stale messages never linger.
    setErrors((current) =>
      pick(
        current,
        Object.keys(current).filter((key) => !(key in patch)),
      ),
    );
  };

  const next = () => {
    const found = pick(validate(false), STEP_FIELDS[step] ?? []);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep(step + 1);
  };

  const submit = (publish: boolean) => {
    const found = validate(publish);
    setErrors(found);
    const firstBad = STEP_FIELDS.findIndex((fields) => fields.some((field) => field in found));
    if (firstBad >= 0) {
      setStep(firstBad);
      return;
    }
    onSubmit(draft, timeZone, publish);
  };

  const last = step === EVENT_FORM_STEPS - 1;
  return (
    <Screen maxWidth={640}>
      <View style={{ gap: spacing[2] }}>
        <Text variant="caption" tone="secondary">
          {t('create.stepOf', { current: step + 1, total: EVENT_FORM_STEPS })}
        </Text>
        <Text variant="headline" heading={1}>
          {title}
        </Text>
      </View>
      {submitError ? <Banner kind="danger" message={submitError} /> : null}
      {mode === 'edit' && step === 1 ? (
        <Banner kind="info" message={t('edit.materialHint')} />
      ) : null}

      <EventForm
        catalog={catalog}
        draft={draft}
        onChange={change}
        errors={errors}
        step={step}
        locked={locked}
        now={new Date()}
      />

      <View style={{ gap: spacing[3] }}>
        {last && mode === 'create' ? (
          <>
            <Button
              label={t('create.publish')}
              loading={busy === 'publish'}
              loadingLabel={t('create.publishing')}
              disabled={busy !== null}
              onPress={() => submit(true)}
              fullWidth
            />
            <Button
              variant="secondary"
              label={t('create.saveDraft')}
              loading={busy === 'draft'}
              loadingLabel={t('create.saving')}
              disabled={busy !== null}
              onPress={() => submit(false)}
              fullWidth
            />
          </>
        ) : null}
        {last && mode === 'edit' ? (
          <Button
            label={t('edit.save')}
            loading={busy === 'save'}
            loadingLabel={t('create.saving')}
            onPress={() => submit(publishOnSaveIf?.(draft) ?? false)}
            fullWidth
          />
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] }}>
          {step > 0 ? (
            <Button
              variant="tertiary"
              label={t('create.back')}
              onPress={() => {
                setErrors({});
                setStep(step - 1);
              }}
            />
          ) : (
            <View />
          )}
          {last ? null : <Button label={t('create.next')} onPress={next} />}
        </View>
      </View>
    </Screen>
  );
}
