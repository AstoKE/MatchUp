import {
  BOOKING_STATUSES,
  formatTypedDate,
  parseTypedDate,
  parseTypedTime,
  SKILL_LEVELS,
  utcToZonedParts,
  type EventDraft,
  type EventDraftErrors,
} from '@matchup/domain';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type Catalog } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import {
  Button,
  Checkbox,
  SegmentedChoice,
  Select,
  Text,
  TextField,
  ToggleChip,
  useTheme,
} from '@/ui';
import { eventValidationMessage } from '../format';

export const EVENT_FORM_STEPS = 3;

/** Fields validated (and shown) on each step, in order. */
export const STEP_FIELDS: readonly (readonly (keyof EventDraft)[])[] = [
  ['sportId', 'formatId', 'title', 'description'],
  ['date', 'time', 'durationMinutes', 'districtId', 'placeLabel', 'addressText'],
  ['capacity', 'skillMin', 'costText', 'costNote', 'equipmentNote', 'participantNotes'],
];

const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480] as const;

export interface EventFormProps {
  catalog: Catalog;
  draft: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
  errors: EventDraftErrors;
  step: number;
  /** Published events: sport, format and "organizer plays" are immutable (I-7). */
  locked: boolean;
  now: Date;
}

export function EventForm(props: EventFormProps) {
  if (props.step === 0) return <WhatStep {...props} />;
  if (props.step === 1) return <WhenWhereStep {...props} />;
  return <ParticipationStep {...props} />;
}

function WhatStep({ catalog, draft, onChange, errors, locked }: EventFormProps) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const locale = currentLocale();
  const sport = catalog.sports.find((s) => s.id === draft.sportId);
  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('steps.what')}
      </Text>
      {locked ? (
        <Text variant="caption" tone="secondary">
          {t('fields.immutableHint')}
        </Text>
      ) : null}
      <Select
        label={t('fields.sport')}
        placeholder={t('fields.sport')}
        value={draft.sportId}
        disabled={locked}
        options={catalog.sports.map((s) => ({
          value: s.id,
          label: localizedName(s.names, locale),
        }))}
        onChange={(sportId) => {
          if (sportId === draft.sportId) return;
          const first = catalog.sports.find((s) => s.id === sportId)?.formats[0];
          onChange({
            sportId,
            formatId: first?.id ?? null,
            capacity: first?.defaultCapacity ?? draft.capacity,
          });
        }}
        error={eventValidationMessage(errors.sportId)}
      />
      <Select
        label={t('fields.format')}
        placeholder={t('fields.format')}
        value={draft.formatId}
        disabled={locked || !sport}
        options={(sport?.formats ?? []).map((f) => ({
          value: f.id,
          label: t('fields.formatOption', {
            name: localizedName(f.names, locale),
            min: f.minParticipants,
            max: f.maxParticipants,
          }),
        }))}
        onChange={(formatId) => {
          const format = sport?.formats.find((f) => f.id === formatId);
          onChange({ formatId, capacity: format?.defaultCapacity ?? draft.capacity });
        }}
        error={eventValidationMessage(errors.formatId)}
      />
      <TextField
        label={t('fields.title')}
        hint={t('fields.titleHint')}
        value={draft.title}
        onChangeText={(title) => onChange({ title })}
        error={eventValidationMessage(errors.title)}
        maxLength={80}
        returnKeyType="next"
      />
      <TextField
        label={t('fields.description')}
        value={draft.description}
        onChangeText={(description) => onChange({ description })}
        error={eventValidationMessage(errors.description)}
        maxLength={2000}
        multiline
      />
    </View>
  );
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function WhenWhereStep({ catalog, draft, onChange, errors, now }: EventFormProps) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const locale = currentLocale();
  const city = catalog.cities.find((c) => c.id === draft.cityId) ?? catalog.cities[0];
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const today = utcToZonedParts(now.toISOString(), timeZone).date;
  const [dateText, setDateText] = useState(formatTypedDate(draft.date));
  const [timeText, setTimeText] = useState(draft.time);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const pickDate = (iso: string) => {
    setDateText(formatTypedDate(iso));
    onChange({ date: iso });
  };

  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('steps.whenWhere')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((iso, i) => (
          <ToggleChip
            key={iso}
            label={
              i === 0
                ? t('fields.today')
                : i === 1
                  ? t('fields.tomorrow')
                  : weekday.format(new Date(`${iso}T12:00:00Z`))
            }
            selected={draft.date === iso}
            onPress={() => pickDate(iso)}
          />
        ))}
      </View>
      <TextField
        label={t('fields.date')}
        value={dateText}
        onChangeText={(text) => {
          setDateText(text);
          onChange({ date: parseTypedDate(text) ?? text });
        }}
        error={eventValidationMessage(errors.date)}
        inputMode="numeric"
        maxLength={10}
      />
      <TextField
        label={t('fields.time')}
        value={timeText}
        onChangeText={(text) => {
          setTimeText(text);
          onChange({ time: parseTypedTime(text) ?? text });
        }}
        error={eventValidationMessage(errors.time)}
        inputMode="numeric"
        maxLength={5}
      />
      <Select
        label={t('fields.duration')}
        placeholder={t('fields.duration')}
        value={String(draft.durationMinutes)}
        options={DURATIONS.map((d) => ({
          value: String(d),
          label: t('fields.minutes', { count: d }),
        }))}
        onChange={(value) => onChange({ durationMinutes: Number(value) })}
        error={eventValidationMessage(errors.durationMinutes)}
      />
      <Select
        label={t('fields.city')}
        placeholder={t('fields.city')}
        value={draft.cityId}
        options={catalog.cities.map((c) => ({
          value: c.id,
          label: localizedName(c.names, locale),
        }))}
        onChange={(cityId) =>
          onChange({ cityId, districtId: cityId === draft.cityId ? draft.districtId : null })
        }
      />
      <Select
        label={t('fields.district')}
        placeholder={t('fields.district')}
        value={draft.districtId}
        disabled={!draft.cityId}
        options={(catalog.cities.find((c) => c.id === draft.cityId)?.districts ?? []).map((d) => ({
          value: d.id,
          label: localizedName(d.names, locale),
        }))}
        onChange={(districtId) => onChange({ districtId })}
        error={eventValidationMessage(errors.districtId)}
      />
      <TextField
        label={t('fields.place')}
        hint={t('fields.placeHint')}
        value={draft.placeLabel}
        onChangeText={(placeLabel) => onChange({ placeLabel })}
        error={eventValidationMessage(errors.placeLabel)}
        maxLength={120}
      />
      <TextField
        label={t('fields.address')}
        hint={t('fields.addressHint')}
        value={draft.addressText}
        onChangeText={(addressText) => onChange({ addressText })}
        error={eventValidationMessage(errors.addressText)}
        maxLength={300}
      />
      <SegmentedChoice
        label={t('fields.locationVisibility')}
        value={draft.locationVisibility}
        onChange={(locationVisibility) => onChange({ locationVisibility })}
        options={[
          { value: 'PUBLIC', label: t('fields.locationPublic') },
          { value: 'APPROVED_ONLY', label: t('fields.locationApproved') },
        ]}
      />
      {draft.locationVisibility === 'APPROVED_ONLY' ? (
        <Text variant="caption" tone="secondary">
          {t('fields.locationApprovedHint')}
        </Text>
      ) : null}
    </View>
  );
}

function ParticipationStep({ catalog, draft, onChange, errors, locked }: EventFormProps) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const format = catalog.sports
    .find((s) => s.id === draft.sportId)
    ?.formats.find((f) => f.id === draft.formatId);
  const min = format?.minParticipants ?? 2;
  const max = format?.maxParticipants ?? 500;
  const skillOptions = SKILL_LEVELS.map((level) => ({
    value: String(level),
    label: String(level),
  }));
  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('steps.participation')}
      </Text>
      <View style={{ gap: spacing[2] }}>
        <Text variant="label">{t('fields.capacity')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Button
            variant="secondary"
            label="−"
            accessibilityLabel={t('fields.decrease')}
            disabled={draft.capacity <= min}
            onPress={() => onChange({ capacity: draft.capacity - 1 })}
          />
          <Text accessibilityLiveRegion="polite">
            {t('fields.capacityValue', { count: draft.capacity })}
          </Text>
          <Button
            variant="secondary"
            label="+"
            accessibilityLabel={t('fields.increase')}
            disabled={draft.capacity >= max}
            onPress={() => onChange({ capacity: draft.capacity + 1 })}
          />
        </View>
        <Text variant="caption" tone={errors.capacity ? 'danger' : 'secondary'}>
          {eventValidationMessage(errors.capacity) ?? t('fields.capacityRange', { min, max })}
        </Text>
      </View>
      {locked ? null : (
        <Checkbox
          label={t('fields.organizerPlays')}
          checked={draft.organizerPlays}
          onChange={(organizerPlays) => onChange({ organizerPlays })}
        />
      )}
      <Checkbox
        label={t('fields.waitlist')}
        checked={draft.waitlistEnabled}
        onChange={(waitlistEnabled) => onChange({ waitlistEnabled })}
      />
      <SegmentedChoice
        label={t('fields.visibility')}
        value={draft.visibility}
        onChange={(visibility) => onChange({ visibility })}
        options={[
          { value: 'PUBLIC', label: t('fields.visibilityPublic') },
          { value: 'INVITE_ONLY', label: t('fields.visibilityInvite') },
        ]}
      />
      <Select
        label={t('fields.skillMin')}
        placeholder={t('fields.skillAny')}
        noneLabel={t('fields.skillAny')}
        value={draft.skillMin === null ? null : String(draft.skillMin)}
        options={skillOptions}
        onChange={(value) => onChange({ skillMin: value === null ? null : Number(value) })}
        error={eventValidationMessage(errors.skillMin)}
      />
      <Select
        label={t('fields.skillMax')}
        placeholder={t('fields.skillAny')}
        noneLabel={t('fields.skillAny')}
        value={draft.skillMax === null ? null : String(draft.skillMax)}
        options={skillOptions}
        onChange={(value) => onChange({ skillMax: value === null ? null : Number(value) })}
      />
      <Select
        label={t('fields.booking')}
        placeholder={t('fields.booking')}
        value={draft.bookingStatus}
        options={BOOKING_STATUSES.map((status) => ({
          value: status,
          label: t(`booking.${status}`),
        }))}
        onChange={(value) => {
          const status = BOOKING_STATUSES.find((s) => s === value);
          if (status) onChange({ bookingStatus: status });
        }}
      />
      <Text variant="caption" tone="secondary">
        {t('fields.bookingHint')}
      </Text>
      <TextField
        label={t('fields.cost')}
        hint={t('fields.costHint')}
        value={draft.costText}
        onChangeText={(costText) => onChange({ costText })}
        error={eventValidationMessage(errors.costText)}
        inputMode="decimal"
        maxLength={12}
      />
      <TextField
        label={t('fields.costNote')}
        value={draft.costNote}
        onChangeText={(costNote) => onChange({ costNote })}
        error={eventValidationMessage(errors.costNote)}
        maxLength={200}
      />
      <TextField
        label={t('fields.equipment')}
        value={draft.equipmentNote}
        onChangeText={(equipmentNote) => onChange({ equipmentNote })}
        error={eventValidationMessage(errors.equipmentNote)}
        maxLength={500}
        multiline
      />
      <TextField
        label={t('fields.participantNotes')}
        hint={t('fields.participantNotesHint')}
        value={draft.participantNotes}
        onChangeText={(participantNotes) => onChange({ participantNotes })}
        error={eventValidationMessage(errors.participantNotes)}
        maxLength={1000}
        multiline
      />
    </View>
  );
}
