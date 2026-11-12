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
import { decideBusiness, type BusinessRequest, type BusinessRequestStatus } from '../api/admin-api';
import { useBusinessRequests, useDecision } from '../hooks';
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
  return (
    <View style={{ gap: spacing[3] }}>
      <SegmentedChoice<BusinessRequestStatus>
        label={t('admin:businesses.filter')}
        value={status}
        onChange={setStatus}
        options={(['PENDING', 'ACTIVE', 'REJECTED'] as const).map((value) => ({
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
    </Panel>
  );
}
