import { VENUE_KINDS, type EventDraft, type GeoPoint, type VenueKind } from '@matchup/domain';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTrack } from '@/features/analytics';
import { localizedName, type Catalog } from '@/features/catalog';
import { MapCanvas, type MapMarker } from '@/features/map';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { mapStyleUrl } from '@/lib/map-config';
import {
  Banner,
  Button,
  SegmentedChoice,
  Sheet,
  Text,
  TextField,
  ToggleChip,
  useTheme,
  useToast,
} from '@/ui';
import { useSuggestVenue } from '../hooks';

const TURKEY: GeoPoint = { lat: 39.0, lon: 35.2 };

/** Where a picker opens: the point already chosen, else the district seat, else the province, else Turkey. */
function startOf(catalog: Catalog, draft: EventDraft): { center: GeoPoint; zoom: number } {
  const city = catalog.cities.find((c) => c.id === draft.cityId);
  const district = city?.districts.find((d) => d.id === draft.districtId);
  if (draft.point) return { center: draft.point, zoom: 15 };
  if (district?.center) return { center: district.center, zoom: 13 };
  if (city?.center) return { center: city.center, zoom: 10 };
  return { center: TURKEY, zoom: 5 };
}

const fixed = (n: number) => n.toFixed(5);

/** A map that marks where one taps; the chosen point is also written out, so it can be checked without the map. */
function PickMap({
  start,
  value,
  onPick,
  height,
}: {
  start: { center: GeoPoint; zoom: number };
  value: GeoPoint | null;
  onPick: (point: GeoPoint) => void;
  height: number;
}) {
  const { t } = useTranslation('events');
  if (!mapStyleUrl) return null;
  const markers: MapMarker[] = value
    ? [{ id: 'choice', point: value, kind: 'choice', label: t('fields.pinChoice') }]
    : [];
  return (
    <MapCanvas
      styleUrl={mapStyleUrl}
      center={start.center}
      zoom={start.zoom}
      markers={markers}
      onPressMap={onPick}
      accessibilityLabel={t('fields.pinMapLabel')}
      height={height}
    />
  );
}

/**
 * The organizer's pin (Phase 4 / M5), optional. Not offered without a configured map. A hidden location shows others
 * only the pin's ~500 m cell (server side, 20261107100000).
 */
export function PinField({
  catalog,
  draft,
  onChange,
}: {
  catalog: Catalog;
  draft: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const track = useTrack();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<GeoPoint | null>(null);
  if (!mapStyleUrl || !draft.districtId) return null;
  const start = startOf(catalog, draft);
  return (
    <View style={{ gap: spacing[2] }}>
      <Text variant="label">{t('events:fields.pin')}</Text>
      <Text tone="secondary">
        {draft.point
          ? t('events:fields.pinSet', { lat: fixed(draft.point.lat), lon: fixed(draft.point.lon) })
          : t('events:fields.pinNone')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Button
          variant="secondary"
          label={draft.point ? t('events:fields.pinChange') : t('events:fields.pinChoose')}
          aria-expanded={open}
          onPress={() => {
            setChoice(draft.point);
            setOpen(true);
            track({ name: 'map_opened', props: { where: 'PIN' } });
          }}
        />
        {draft.point ? (
          <Button
            variant="tertiary"
            label={t('events:fields.pinRemove')}
            onPress={() => onChange({ point: null })}
          />
        ) : null}
      </View>
      <Sheet
        visible={open}
        title={t('events:fields.pinTitle')}
        onClose={() => setOpen(false)}
        closeLabel={t('common:close')}
        footer={
          <View style={{ gap: spacing[2] }}>
            <Button
              label={t('events:fields.pinSave')}
              disabled={!choice}
              fullWidth
              onPress={() => {
                onChange({ point: choice });
                setOpen(false);
              }}
            />
            <Button
              variant="tertiary"
              label={t('common:cancel')}
              fullWidth
              onPress={() => setOpen(false)}
            />
          </View>
        }
      >
        <Text variant="bodySm" tone="secondary">
          {t('events:fields.pinHelp')}
        </Text>
        <PickMap start={start} value={choice} onPick={setChoice} height={320} />
        {choice ? (
          <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
            {t('events:fields.pinSet', { lat: fixed(choice.lat), lon: fixed(choice.lon) })}
          </Text>
        ) : null}
      </Sheet>
    </View>
  );
}

/**
 * "Not in the list? Suggest a venue" (Phase 4 / M5): name, kind, sports and a point on the map. The suggestion is listed
 * at once as unverified and chosen for this event.
 */
export function SuggestVenue({
  catalog,
  draft,
  onChange,
}: {
  catalog: Catalog;
  draft: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const locale = currentLocale();
  const suggest = useSuggestVenue();
  const track = useTrack();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<VenueKind>('COMMERCIAL_FACILITY');
  const [sportIds, setSportIds] = useState<string[]>([]);
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [missing, setMissing] = useState(false);
  if (!mapStyleUrl || !draft.cityId || !draft.districtId) return null;
  const { cityId, districtId } = draft;
  const start = startOf(catalog, { ...draft, point: null });
  const save = () => {
    if (name.trim().length < 3 || sportIds.length === 0 || !point) {
      setMissing(true);
      return;
    }
    setMissing(false);
    suggest.mutate(
      { kind, name: name.trim(), cityId, districtId, point, sportIds },
      {
        onSuccess: (venueId) => {
          onChange({
            venueId,
            point,
            ...(draft.placeLabel.trim() === '' ? { placeLabel: name.trim() } : {}),
          });
          toast.show(t('events:fields.suggestDone'), 'success');
          setOpen(false);
        },
      },
    );
  };
  return (
    <>
      <Button
        variant="tertiary"
        label={t('events:fields.suggestOpen')}
        aria-expanded={open}
        onPress={() => {
          setSportIds(draft.sportId ? [draft.sportId] : []);
          setOpen(true);
          track({ name: 'venue_suggest_opened' });
        }}
      />
      <Sheet
        visible={open}
        title={t('events:fields.suggestTitle')}
        onClose={() => setOpen(false)}
        closeLabel={t('common:close')}
        footer={
          <View style={{ gap: spacing[2] }}>
            <Button
              label={t('events:fields.suggestSave')}
              loading={suggest.isPending}
              fullWidth
              onPress={save}
            />
            <Button
              variant="tertiary"
              label={t('common:cancel')}
              fullWidth
              onPress={() => setOpen(false)}
            />
          </View>
        }
      >
        <Text variant="bodySm" tone="secondary">
          {t('events:fields.suggestHelp')}
        </Text>
        <TextField
          label={t('events:fields.suggestName')}
          value={name}
          onChangeText={setName}
          maxLength={80}
        />
        <SegmentedChoice
          label={t('events:fields.suggestKind')}
          value={kind}
          onChange={setKind}
          options={VENUE_KINDS.map((value) => ({ value, label: t(`events:venueKind.${value}`) }))}
        />
        <Text variant="label">{t('events:fields.suggestSports')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {catalog.sports.map((s) => (
            <ToggleChip
              key={s.id}
              label={localizedName(s.names, locale)}
              selected={sportIds.includes(s.id)}
              onPress={() =>
                setSportIds((ids) =>
                  ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id],
                )
              }
            />
          ))}
        </View>
        <Text variant="label">{t('events:fields.suggestPin')}</Text>
        <PickMap start={start} value={point} onPick={setPoint} height={260} />
        {point ? (
          <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
            {t('events:fields.pinSet', { lat: fixed(point.lat), lon: fixed(point.lon) })}
          </Text>
        ) : null}
        {missing ? <Banner kind="danger" message={t('events:fields.suggestMissing')} /> : null}
        {suggest.isError ? <Banner kind="danger" message={errorText(suggest.error)} /> : null}
      </Sheet>
    </>
  );
}
