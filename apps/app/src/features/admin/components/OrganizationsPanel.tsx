import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  EmptyState,
  SegmentedChoice,
  Skeleton,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@/ui';
import {
  decideOrganization,
  type OrganizationRequest,
  type OrganizationRequestStatus,
} from '../api/admin-api';
import { useDecision, useOrganizationRequests } from '../hooks';
import { Confirmed, formatWhen, Panel } from './Pieces';

/**
 * Organization requests (ADR-0030): the founder looks at the person and approves, or rejects with a reason the requester
 * will read. Oldest waiting request first. Every decision is final and audited on the server.
 */
export function OrganizationsPanel({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const [status, setStatus] = useState<OrganizationRequestStatus>('PENDING');
  const requests = useOrganizationRequests(status);

  return (
    <View style={{ gap: spacing[3] }}>
      <SegmentedChoice<OrganizationRequestStatus>
        label={t('admin:organizations.filter')}
        value={status}
        onChange={setStatus}
        options={(['PENDING', 'ACTIVE', 'REJECTED'] as const).map((value) => ({
          value,
          label: t(`admin:organizations.status.${value}`),
        }))}
      />
      {requests.isError ? (
        <EmptyState
          title={t('admin:section.organizations')}
          body={errorText(requests.error)}
          actionLabel={t('common:retry')}
          onAction={() => void requests.refetch()}
        />
      ) : !requests.data ? (
        <Skeleton height={96} radiusKey="md" />
      ) : requests.data.length === 0 ? (
        <Text tone="secondary">{t('admin:organizations.empty')}</Text>
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
  request: OrganizationRequest;
  onOpenUser: (id: string) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const locale = currentLocale();
  const [reason, setReason] = useState('');
  const decide = useDecision((input: { approve: boolean }) =>
    decideOrganization(request.id, input.approve, input.approve ? null : reason.trim()),
  );
  const city = catalog.data?.cities.find((c) => c.id === request.city_id);
  const sports = (catalog.data?.sports ?? [])
    .filter((s) => request.sport_ids.includes(s.id))
    .map((s) => localizedName(s.names, locale))
    .join(', ');
  // The decided request leaves the list: a per-call onSuccess would be skipped (see VenuesPanel).
  const run = (approve: boolean) =>
    void decide
      .mutateAsync({ approve })
      .then(() =>
        toast.show(
          t(approve ? 'admin:organizations.approved' : 'admin:organizations.rejected'),
          'success',
        ),
      )
      .catch(() => undefined);

  return (
    <Panel>
      <Text variant="label">
        {request.name} · {formatWhen(request.created_at)}
      </Text>
      <Text variant="bodySm" tone="secondary">
        {[city ? localizedName(city.names, locale) : null, sports || null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {request.description ? <Text>{request.description}</Text> : null}
      <Text variant="caption" tone="secondary">
        {t('admin:organizations.requester', {
          since: formatWhen(request.requester_since),
          events: request.requester_events_organized,
          reports: request.requester_open_reports,
        })}
      </Text>
      {request.reject_reason ? (
        <Text variant="caption" tone="secondary">
          {t('admin:organizations.reason', { reason: request.reject_reason })}
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
            label={t('admin:organizations.reasonLabel')}
            hint={t('admin:organizations.reasonHint')}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <Confirmed
              variant="primary"
              label={t('admin:organizations.approve')}
              pending={decide.isPending}
              onConfirm={() => run(true)}
            />
            <Confirmed
              variant="destructive"
              label={t('admin:organizations.reject')}
              disabled={reason.trim().length === 0}
              pending={decide.isPending}
              onConfirm={() => run(false)}
            />
          </View>
        </View>
      ) : null}
    </Panel>
  );
}
