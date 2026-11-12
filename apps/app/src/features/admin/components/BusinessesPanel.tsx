import { useState } from 'react';
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
  Skeleton,
  Text,
  Select,
  TextField,
  ToggleChip,
  useTheme,
  useToast,
} from '@/ui';
import {
  createBusiness,
  decideBusiness,
  setBusinessHidden,
  type BusinessRequest,
  type BusinessRequestStatus,
} from '../api/admin-api';
import { useBusinessRequests, useCommercialVenues, useDecision, useFoundUsers } from '../hooks';
import { Confirmed, formatWhen, Panel } from './Pieces';

/**
 * Business requests (ADR-0031): ownership is the founder's call. The contact details let them check with the facility;
 * approve, or reject with a reason the requester reads. Every decision is final and audited on the server.
 */
export function BusinessesPanel({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const [status, setStatus] = useState<BusinessRequestStatus>('PENDING');
  const requests = useBusinessRequests(status);
  const [adding, setAdding] = useState(false);
  return (
    <View style={{ gap: spacing[3] }}>
      {adding ? (
        <AddBusinessForm onDone={() => setAdding(false)} />
      ) : (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            variant="secondary"
            label={t('admin:businesses.add')}
            aria-expanded={false}
            onPress={() => setAdding(true)}
          />
        </View>
      )}
      <SegmentedChoice<BusinessRequestStatus>
        label={t('admin:businesses.filter')}
        value={status}
        onChange={setStatus}
        options={(['PENDING', 'ACTIVE', 'REJECTED', 'HIDDEN'] as const).map((value) => ({
          value,
          label: t(`admin:businesses.status.${value}`),
        }))}
      />
      {requests.isError ? (
        <EmptyState
          title={t('admin:section.businesses')}
          body={errorText(requests.error)}
          actionLabel={t('common:retry')}
          onAction={() => void requests.refetch()}
        />
      ) : !requests.data ? (
        <Skeleton height={96} radiusKey="md" />
      ) : requests.data.length === 0 ? (
        <Text tone="secondary">{t('admin:businesses.empty')}</Text>
      ) : (
        requests.data.map((request) => (
          <RequestCard key={request.id} request={request} onOpenUser={onOpenUser} />
        ))
      )}
    </View>
  );
}

function RequestCard({
  request,
  onOpenUser,
}: {
  request: BusinessRequest;
  onOpenUser: (id: string) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const [reason, setReason] = useState('');
  const decide = useDecision((input: { approve: boolean }) =>
    decideBusiness(request.id, input.approve, input.approve ? null : reason.trim()),
  );
  const city = catalog.data?.cities.find((c) => c.id === request.city_id);
  const contact = [request.contact_phone, request.contact_email].filter(Boolean).join(' · ');
  // The decided request leaves the list: a per-call onSuccess would be skipped (see VenuesPanel).
  const run = (approve: boolean) =>
    void decide
      .mutateAsync({ approve })
      .then(() =>
        toast.show(
          t(approve ? 'admin:businesses.approved' : 'admin:businesses.rejected'),
          'success',
        ),
      )
      .catch(() => undefined);

  return (
    <Panel>
      <Text variant="label">
        {request.name}
        {city ? ` · ${localizedName(city.names, currentLocale())}` : ''} ·{' '}
        {formatWhen(request.created_at)}
      </Text>
      <Text variant="bodySm">{t('admin:businesses.contact', { contact })}</Text>
      {request.message ? (
        <Text variant="bodySm">{t('admin:businesses.message', { message: request.message })}</Text>
      ) : null}
      <Text variant="bodySm" tone="secondary">
        {request.venues.length > 0
          ? t('admin:businesses.venues', { names: request.venues.map((v) => v.name).join(', ') })
          : t('admin:businesses.noVenues')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('admin:businesses.requester', {
          since: formatWhen(request.requester_since),
          reports: request.requester_open_reports,
        })}
      </Text>
      {request.reject_reason ? (
        <Text variant="caption" tone="secondary">
          {t('admin:businesses.reason', { reason: request.reject_reason })}
        </Text>
      ) : null}
      {decide.isError ? <Banner kind="danger" message={errorText(decide.error)} /> : null}
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          variant="secondary"
          label={request.requester_name ?? t('admin:reports.unknown')}
          onPress={() => onOpenUser(request.requester_id)}
        />
      </View>
      {request.status === 'PENDING' ? (
        <View style={{ gap: spacing[2] }}>
          <TextField
            label={t('admin:businesses.reasonLabel')}
            hint={t('admin:businesses.reasonHint')}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Confirmed
              variant="primary"
              label={t('admin:businesses.approve')}
              pending={decide.isPending}
              onConfirm={() => run(true)}
            />
            <Confirmed
              variant="destructive"
              label={t('admin:businesses.reject')}
              disabled={reason.trim().length === 0}
              pending={decide.isPending}
              onConfirm={() => run(false)}
            />
          </View>
        </View>
      ) : null}
      {request.status === 'ACTIVE' || request.status === 'HIDDEN' ? (
        <HideOrRestore id={request.id} hidden={request.status === 'HIDDEN'} />
      ) : null}
    </Panel>
  );
}

/** Hide (active) or restore (hidden) with a required note; recorded as a moderation action. */
function HideOrRestore({ id, hidden }: { id: string; hidden: boolean }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const [note, setNote] = useState('');
  const change = useDecision(() => setBusinessHidden(id, !hidden, note.trim()));
  return (
    <View style={{ gap: spacing[2] }}>
      {change.isError ? <Banner kind="danger" message={errorText(change.error)} /> : null}
      <TextField
        label={t('admin:businesses.noteLabel')}
        hint={t('admin:businesses.noteHint')}
        value={note}
        onChangeText={setNote}
        maxLength={1000}
      />
      <View style={{ alignItems: 'flex-start' }}>
        <Confirmed
          variant={hidden ? 'primary' : 'destructive'}
          label={t(hidden ? 'admin:businesses.restore' : 'admin:businesses.hide')}
          disabled={note.trim().length === 0}
          pending={change.isPending}
          onConfirm={() =>
            void change
              .mutateAsync(undefined)
              .then(() =>
                toast.show(
                  t(hidden ? 'admin:businesses.restored' : 'admin:businesses.hidden'),
                  'success',
                ),
              )
              .catch(() => undefined)
          }
        />
      </View>
    </View>
  );
}

/** P-19: an administrator adds a business directly, with its owner and commercial facilities. */
function AddBusinessForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const search = usePlaceSearch();
  const locale = currentLocale();
  const [name, setName] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const [venueQuery, setVenueQuery] = useState('');
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const found = useFoundUsers(query);
  const facilities = useCommercialVenues(cityId, venueQuery);
  const create = useDecision(() =>
    createBusiness({
      name: name.trim(),
      cityId: cityId as string,
      ownerId: (owner as { id: string }).id,
      venueIds: venues.map((v) => v.id),
    }),
  );
  const ready = name.trim().length >= 2 && cityId !== null && owner !== null;
  const shown = [
    ...venues,
    ...(facilities.data ?? []).filter((v) => !venues.some((c) => c.id === v.id)),
  ];
  return (
    <Panel>
      <Text variant="label">{t('admin:businesses.add')}</Text>
      {create.isError ? <Banner kind="danger" message={errorText(create.error)} /> : null}
      <TextField
        label={t('admin:businesses.name')}
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <Select
        label={t('admin:businesses.city')}
        placeholder={t('admin:businesses.city')}
        value={cityId}
        search={search}
        options={(catalog.data?.cities ?? []).map((c) => ({
          value: c.id,
          label: localizedName(c.names, locale),
        }))}
        onChange={(next) => {
          setCityId(next);
          setVenues([]);
        }}
      />
      {owner ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], alignItems: 'center' }}
        >
          <Text>{t('admin:businesses.owner', { name: owner.name })}</Text>
          <Button
            variant="tertiary"
            label={t('admin:businesses.changeOwner')}
            onPress={() => setOwner(null)}
          />
        </View>
      ) : (
        <View style={{ gap: spacing[2] }}>
          <TextField
            label={t('admin:businesses.ownerSearch')}
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={() => setQuery(typed.trim())}
            returnKeyType="search"
          />
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              variant="secondary"
              label={t('admin:users.search')}
              disabled={typed.trim().length < 2}
              onPress={() => setQuery(typed.trim())}
            />
          </View>
          {found.data?.map((person) => (
            <Button
              key={person.id}
              variant="secondary"
              label={person.name ?? t('admin:reports.unknown')}
              onPress={() =>
                setOwner({ id: person.id, name: person.name ?? t('admin:reports.unknown') })
              }
            />
          ))}
        </View>
      )}
      {cityId ? (
        <View style={{ gap: spacing[2] }}>
          <TextField
            label={t('admin:businesses.venueSearch')}
            value={venueQuery}
            onChangeText={setVenueQuery}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {shown.map((venue) => (
              <ToggleChip
                key={venue.id}
                label={venue.name}
                selected={venues.some((v) => v.id === venue.id)}
                onPress={() =>
                  setVenues((current) =>
                    current.some((v) => v.id === venue.id)
                      ? current.filter((v) => v.id !== venue.id)
                      : current.length < 10
                        ? [...current, { id: venue.id, name: venue.name }]
                        : current,
                  )
                }
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Confirmed
          variant="primary"
          label={t('admin:businesses.create')}
          disabled={!ready}
          pending={create.isPending}
          onConfirm={() =>
            void create
              .mutateAsync(undefined)
              .then(() => {
                toast.show(t('admin:businesses.created'), 'success');
                onDone();
              })
              .catch(() => undefined)
          }
        />
        <Button variant="tertiary" label={t('common:cancel')} onPress={onDone} />
      </View>
    </Panel>
  );
}
