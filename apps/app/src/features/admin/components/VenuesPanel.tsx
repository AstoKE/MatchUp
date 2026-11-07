import { VENUE_KINDS, type VenueKind } from '@matchup/domain';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog, usePlaceSearch } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  EmptyState,
  SegmentedChoice,
  Select,
  Skeleton,
  Text,
  TextField,
  ToggleChip,
  useTheme,
  useToast,
} from '@/ui';
import {
  addVenue,
  setVenueStatus,
  type AdminVenue,
  type NewVenue,
  type VenueStatus,
} from '../api/admin-api';
import { useAdminVenues, useDecision } from '../hooks';
import { Confirmed, formatWhen, Panel } from './Pieces';

const STATUSES: readonly VenueStatus[] = ['UNVERIFIED', 'VERIFIED', 'HIDDEN'];

/**
 * Venues (Phase 4 / M4): the queue of suggestions, verified and hidden venues, and a form to add one. Verifying says an
 * administrator checked the place exists; it never says anything about bookings.
 */
export function VenuesPanel() {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const [status, setStatus] = useState<VenueStatus>('UNVERIFIED');
  const [adding, setAdding] = useState(false);
  const venues = useAdminVenues(status);
  const items = useMemo(() => venues.data?.pages.flatMap((p) => p.items) ?? [], [venues.data]);
  return (
    <View style={{ gap: spacing[3] }}>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], alignItems: 'flex-end' }}
      >
        <View style={{ flexGrow: 1 }}>
          <SegmentedChoice
            label={t('admin:venues.status')}
            value={status}
            onChange={setStatus}
            options={STATUSES.map((value) => ({ value, label: t(`admin:venues.${value}`) }))}
          />
        </View>
        <Button
          variant="secondary"
          label={t('admin:venues.add')}
          aria-expanded={adding}
          onPress={() => setAdding((v) => !v)}
        />
      </View>
      {adding ? <AddVenueForm onDone={() => setAdding(false)} /> : null}
      {venues.isError ? (
        <EmptyState
          title={t('admin:venues.loadFailed')}
          body={errorText(venues.error)}
          actionLabel={t('common:retry')}
          onAction={() => void venues.refetch()}
        />
      ) : venues.isPending ? (
        <Skeleton height={72} radiusKey="md" />
      ) : items.length === 0 ? (
        <Text tone="secondary">{t('admin:venues.empty')}</Text>
      ) : (
        <View role="list" style={{ gap: spacing[2] }}>
          {items.map((v) => (
            <View key={v.id} role="listitem">
              <VenueRow venue={v} />
            </View>
          ))}
        </View>
      )}
      {venues.hasNextPage ? (
        <Button
          variant="tertiary"
          label={t('admin:venues.loadMore')}
          loading={venues.isFetchingNextPage}
          onPress={() => void venues.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

function VenueRow({ venue }: { venue: AdminVenue }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const locale = currentLocale();
  const [note, setNote] = useState('');
  const decide = useDecision((action: 'VERIFY' | 'HIDE' | 'RESTORE') =>
    setVenueStatus(venue.id, action, note),
  );
  const city = catalog.data?.cities.find((c) => c.id === venue.city_id);
  const district = city?.districts.find((d) => d.id === venue.district_id);
  const sports = venue.sport_ids
    .map((id) => catalog.data?.sports.find((s) => s.id === id))
    .flatMap((s) => (s ? [localizedName(s.names, locale)] : []));
  const run = (action: 'VERIFY' | 'HIDE' | 'RESTORE') =>
    // mutateAsync, not mutate(…, { onSuccess }): the decision reloads the list and this row leaves it, and React Query
    // skips a per-call callback once its component is gone, which lost the confirmation (found by e2e/admin.spec.ts).
    decide
      .mutateAsync(action)
      .then(() => toast.show(t('admin:venues.done'), 'success'))
      .catch(() => undefined); // shown by the banner while the row is still there
  return (
    <Panel>
      <Text variant="label">
        {venue.name} · {t(`admin:venues.kind.${venue.kind}`)}
      </Text>
      <Text variant="bodySm">
        {[
          district && localizedName(district.names, locale),
          city && localizedName(city.names, locale),
        ]
          .filter(Boolean)
          .join(', ')}
        {venue.address_text ? ` · ${venue.address_text}` : ''}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('admin:venues.openMap', { lat: venue.point.lat, lon: venue.point.lon })} ·{' '}
        {sports.join(', ')}
      </Text>
      <Text variant="caption" tone="secondary">
        {venue.submitter_name
          ? t('admin:venues.by', { name: venue.submitter_name })
          : t('admin:venues.byAdmin')}{' '}
        · {formatWhen(venue.created_at)} · {t('admin:venues.events', { count: venue.events })}
        {venue.open_reports > 0
          ? ` · ${t('admin:venues.reports', { count: venue.open_reports })}`
          : ''}
      </Text>
      {decide.isError ? <Banner kind="danger" message={errorText(decide.error)} /> : null}
      <TextField
        label={t('admin:venues.noteLabel')}
        value={note}
        onChangeText={setNote}
        maxLength={1000}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {!venue.verified && !venue.hidden ? (
          <Confirmed
            variant="primary"
            label={t('admin:venues.verify')}
            pending={decide.isPending}
            onConfirm={() => run('VERIFY')}
          />
        ) : null}
        {venue.hidden ? (
          <Confirmed
            label={t('admin:venues.restore')}
            pending={decide.isPending}
            onConfirm={() => run('RESTORE')}
          />
        ) : (
          <Confirmed
            variant="destructive"
            label={t('admin:venues.hide')}
            pending={decide.isPending}
            onConfirm={() => run('HIDE')}
          />
        )}
      </View>
    </Panel>
  );
}

/** "39.8950, 32.7795" (or with a space only) into a point; null when it is not two numbers. */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const parts = text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const [lat, lon] = parts.map(Number) as [number, number];
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function AddVenueForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const search = usePlaceSearch();
  const locale = currentLocale();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<VenueKind>('COMMERCIAL_FACILITY');
  const [cityId, setCityId] = useState<string | null>(null);
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState('');
  const [addressText, setAddressText] = useState('');
  const [sportIds, setSportIds] = useState<string[]>([]);
  const [sourceRef, setSourceRef] = useState('');
  const [missing, setMissing] = useState(false);
  const add = useDecision((input: NewVenue) => addVenue(input));
  const city = catalog.data?.cities.find((c) => c.id === cityId);
  const point = parseCoordinates(coordinates);
  const save = () => {
    if (name.trim().length < 3 || !cityId || !districtId || !point || sportIds.length === 0) {
      setMissing(true);
      return;
    }
    setMissing(false);
    add.mutate(
      { kind, name: name.trim(), cityId, districtId, point, addressText, sportIds, sourceRef },
      {
        onSuccess: () => {
          toast.show(t('admin:venues.added'), 'success');
          onDone();
        },
      },
    );
  };
  return (
    <Panel>
      <Text variant="title" heading={3}>
        {t('admin:venues.addTitle')}
      </Text>
      <TextField
        label={t('admin:venues.name')}
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <SegmentedChoice
        label={t('admin:venues.kindLabel')}
        value={kind}
        onChange={setKind}
        options={VENUE_KINDS.map((value) => ({ value, label: t(`admin:venues.kind.${value}`) }))}
      />
      <Select
        label={t('admin:venues.city')}
        placeholder={t('admin:venues.city')}
        value={cityId}
        search={search}
        options={(catalog.data?.cities ?? []).map((c) => ({
          value: c.id,
          label: localizedName(c.names, locale),
        }))}
        onChange={(next) => {
          setCityId(next);
          setDistrictId(null);
        }}
      />
      <Select
        label={t('admin:venues.district')}
        placeholder={t('admin:venues.district')}
        value={districtId}
        disabled={!city}
        search={search}
        options={(city?.districts ?? []).map((d) => ({
          value: d.id,
          label: localizedName(d.names, locale),
        }))}
        onChange={setDistrictId}
      />
      <TextField
        label={t('admin:venues.point')}
        hint={t('admin:venues.pointHint')}
        value={coordinates}
        onChangeText={setCoordinates}
        autoCapitalize="none"
        autoCorrect={false}
        error={coordinates.trim() !== '' && !point ? t('admin:venues.pointInvalid') : undefined}
      />
      <TextField
        label={t('admin:venues.address')}
        value={addressText}
        onChangeText={setAddressText}
        maxLength={300}
      />
      <Text variant="label">{t('admin:venues.sports')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {(catalog.data?.sports ?? []).map((s) => (
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
      <TextField
        label={t('admin:venues.source')}
        hint={t('admin:venues.sourceHint')}
        value={sourceRef}
        onChangeText={setSourceRef}
        maxLength={200}
      />
      {missing ? <Banner kind="danger" message={t('admin:venues.missing')} /> : null}
      {add.isError ? <Banner kind="danger" message={errorText(add.error)} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Button label={t('admin:venues.save')} loading={add.isPending} onPress={save} />
        <Button variant="tertiary" label={t('common:cancel')} onPress={onDone} />
      </View>
    </Panel>
  );
}
