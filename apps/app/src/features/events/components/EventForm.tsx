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
import { localizedName, usePlaceSearch, type Catalog } from '@/features/catalog';
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
import { useVenues } from '../hooks';

export const EVENT_FORM_STEPS = 5;

/** Fields validated (and shown) on each step, in order. */
export const STEP_FIELDS: readonly (readonly (keyof EventDraft)[])[] = [
  ['sportId', 'formatId'],
  ['date', 'time', 'durationMinutes', 'capacity'],
  ['districtId', 'placeLabel', 'addressText'],
  ['title', 'description', 'skillMin', 'costText', 'costNote', 'equipmentNote', 'participantNotes'],
  [],
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
  /** The review step's way back to a section. */
  onGoTo: (step: number) => void;
}

export function EventForm(props: EventFormProps) {
  if (props.step === 0) return <WhatStep {...props} />;
  if (props.step === 1) return <WhenStep {...props} />;
  if (props.step === 2) return <WhereStep {...props} />;
  if (props.step === 3) return <DetailsStep {...props} />;
  return <ReviewStep {...props} />;
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
    </View>
  );
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function WhenStep({ catalog, draft, onChange, errors, locked, now }: EventFormProps) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const locale = currentLocale();
  const city = catalog.cities.find((c) => c.id === draft.cityId);
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const today = utcToZonedParts(now.toISOString(), timeZone).date;
  const [dateText, setDateText] = useState(formatTypedDate(draft.date));
  const [timeText, setTimeText] = useState(draft.time);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const format = catalog.sports
    .find((s) => s.id === draft.sportId)
    ?.formats.find((f) => f.id === draft.formatId);
  const min = format?.minParticipants ?? 2;
  const max = format?.maxParticipants ?? 500;

  const pickDate = (iso: string) => {
    setDateText(formatTypedDate(iso));
    onChange({ date: iso });
  };

  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('steps.when')}
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
    </View>
  );
}

function WhereStep({ catalog, draft, onChange, errors }: EventFormProps) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const locale = currentLocale();
  const search = usePlaceSearch();
  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('steps.where')}
      </Text>
      <Select
        label={t('fields.city')}
        placeholder={t('fields.city')}
        value={draft.cityId}
        search={search}
        options={catalog.cities.map((c) => ({
          value: c.id,
          label: localizedName(c.names, locale),
        }))}
        onChange={(cityId) => {
          if (cityId !== draft.cityId) onChange({ cityId, districtId: null, venueId: null });
        }}
      />
      <Select
        label={t('fields.district')}
        placeholder={t('fields.district')}
        value={draft.districtId}
        disabled={!draft.cityId}
        search={search}
        options={(catalog.cities.find((c) => c.id === draft.cityId)?.districts ?? []).map((d) => ({
          value: d.id,
          label: localizedName(d.names, locale),
        }))}
        onChange={(districtId) =>
          onChange(districtId === draft.districtId ? {} : { districtId, venueId: null })
        }
        error={eventValidationMessage(errors.districtId)}
      />
      <VenueField draft={draft} onChange={onChange} />
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
      <SegmentedChoice
        label={t('fields.setting')}
        value={draft.setting ?? 'NONE'}
        onChange={(value) => onChange({ setting: value === 'NONE' ? null : value })}
        options={[
          { value: 'NONE', label: t('fields.settingNone') },
          { value: 'INDOOR', label: t('setting.INDOOR') },
          { value: 'OUTDOOR', label: t('setting.OUTDOOR') },
        ]}
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
    </View>
  );
}

function DetailsStep({ draft, onChange, errors }: EventFormProps) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const skillOptions = SKILL_LEVELS.map((level) => ({
    value: String(level),
    label: String(level),
  }));
  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('steps.details')}
      </Text>
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
      <SegmentedChoice
        label={t('fields.visibility')}
        value={draft.visibility}
        onChange={(visibility) => onChange({ visibility })}
        options={[
          { value: 'PUBLIC', label: t('fields.visibilityPublic') },
          { value: 'INVITE_ONLY', label: t('fields.visibilityInvite') },
        ]}
      />
      <Checkbox
        label={t('fields.waitlist')}
        checked={draft.waitlistEnabled}
        onChange={(waitlistEnabled) => onChange({ waitlistEnabled })}
      />
      <Checkbox
        label={t('fields.autoApprove')}
        checked={draft.autoApprove}
        onChange={(autoApprove) => onChange({ autoApprove })}
      />
      <Text variant="caption" tone="secondary">
        {t('fields.autoApproveHint')}
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

function ReviewStep({ catalog, draft, onGoTo }: EventFormProps) {
  const { t } = useTranslation('events');
  const { colors, radius, spacing } = useTheme();
  const locale = currentLocale();
  const sport = catalog.sports.find((s) => s.id === draft.sportId);
  const format = sport?.formats.find((f) => f.id === draft.formatId);
  const city = catalog.cities.find((c) => c.id === draft.cityId);
  const district = city?.districts.find((d) => d.id === draft.districtId);
  const skill =
    draft.skillMin === null && draft.skillMax === null
      ? t('detail.skillAny')
      : t('detail.skillRange', { min: draft.skillMin ?? 1, max: draft.skillMax ?? 5 });
  const sections: { step: number; title: string; rows: [string, string][] }[] = [
    {
      step: 0,
      title: t('steps.what'),
      rows: [
        [t('fields.sport'), sport ? localizedName(sport.names, locale) : ''],
        [t('fields.format'), format ? localizedName(format.names, locale) : ''],
      ],
    },
    {
      step: 1,
      title: t('steps.when'),
      rows: [
        [t('detail.when'), `${formatTypedDate(draft.date)} ${draft.time}`],
        [t('fields.duration'), t('fields.minutes', { count: draft.durationMinutes })],
        [t('fields.capacity'), t('fields.capacityValue', { count: draft.capacity })],
      ],
    },
    {
      step: 2,
      title: t('steps.where'),
      rows: [
        [
          t('detail.where'),
          [district && localizedName(district.names, locale), draft.placeLabel.trim()]
            .filter(Boolean)
            .join(' · '),
        ],
        [t('fields.booking'), t(`booking.${draft.bookingStatus}`)],
      ],
    },
    {
      step: 3,
      title: t('steps.details'),
      rows: [
        [t('fields.title'), draft.title.trim()],
        [t('detail.skill'), skill],
        ...(draft.costText.trim()
          ? ([[t('detail.cost'), t('detail.costValue', { amount: draft.costText.trim() })]] as [
              string,
              string,
            ][])
          : []),
      ],
    },
  ];
  return (
    <View style={{ gap: spacing[4] }}>
      <Text variant="title" heading={2}>
        {t('steps.review')}
      </Text>
      {sections.map((section) => (
        <View
          key={section.step}
          style={{
            gap: spacing[2],
            padding: spacing[3],
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.surfaceRaised,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="label" heading={3}>
              {section.title}
            </Text>
            <Button
              variant="tertiary"
              label={t('create.editSection')}
              accessibilityLabel={t('create.editSectionNamed', { section: section.title })}
              onPress={() => onGoTo(section.step)}
            />
          </View>
          {section.rows.map(([label, value]) => (
            <View
              key={label}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: spacing[2],
              }}
            >
              <Text variant="bodySm" tone="secondary">
                {label}
              </Text>
              <Text variant="label" style={{ flexShrink: 1 }}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Text tone="secondary">
        {t(draft.autoApprove ? 'fields.autoApproveHint' : 'create.approvalNote')}
      </Text>
      {draft.costText.trim() ? (
        <Text variant="caption" tone="secondary">
          {t('fields.costHint')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A listed venue of the district (Phase 4), optional. Choosing one fills an empty place and address; the venue's point
 * becomes the event's on the server. An unverified venue was suggested by players and says so.
 */
function VenueField({
  draft,
  onChange,
}: {
  draft: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const search = usePlaceSearch();
  const venues = useVenues(
    draft.cityId && draft.districtId
      ? { cityId: draft.cityId, districtId: draft.districtId }
      : null,
  );
  const list = venues.data ?? [];
  if (!draft.districtId || (venues.isSuccess && list.length === 0 && !draft.venueId)) return null;
  return (
    <View style={{ gap: spacing[1] }}>
      <Select
        label={t('fields.venue')}
        placeholder={venues.isPending ? t('fields.venueLoading') : t('fields.venueNone')}
        noneLabel={t('fields.venueNone')}
        value={draft.venueId}
        search={list.length > 8 ? search : undefined}
        options={list.map((v) => ({
          value: v.id,
          label: v.verified ? v.name : t('fields.venueUnverified', { name: v.name }),
        }))}
        onChange={(venueId) => {
          const venue = list.find((v) => v.id === venueId);
          onChange({
            venueId,
            ...(venue && draft.placeLabel.trim() === '' ? { placeLabel: venue.name } : {}),
            ...(venue?.addressText && draft.addressText.trim() === ''
              ? { addressText: venue.addressText }
              : {}),
          });
        }}
      />
      <Text variant="caption" tone="secondary">
        {t('fields.venueHint')}
      </Text>
    </View>
  );
}
