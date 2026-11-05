import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/lib/error-text';
import { Banner, Button, Skeleton, Text, TextField, useTheme, useToast } from '@/ui';
import {
  hideReview,
  reinstateUser,
  restoreReview,
  suspendUser,
  type AdminReview,
} from '../api/admin-api';
import { useDecision, useFoundUsers, useReviewsOf, useUser } from '../hooks';
import { Confirmed, formatWhen, Panel } from './Pieces';

/** Find a person, see what is known of them, and decide: suspend, reinstate, hide a review. */
export function PeoplePanel({
  userId,
  onSelect,
}: {
  userId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const found = useFoundUsers(query);
  if (userId) return <PersonDetail id={userId} onBack={() => onSelect(null)} />;
  return (
    <View style={{ gap: spacing[3] }}>
      <TextField
        label={t('admin:users.searchLabel')}
        hint={t('admin:users.searchHint')}
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={() => setQuery(typed.trim())}
        returnKeyType="search"
      />
      <Button
        label={t('admin:users.search')}
        disabled={typed.trim().length < 2}
        onPress={() => setQuery(typed.trim())}
      />
      {found.isError ? <Banner kind="danger" message={errorText(found.error)} /> : null}
      {found.data && found.data.length === 0 ? (
        <Text tone="secondary">{t('admin:users.none')}</Text>
      ) : null}
      <View role="list" style={{ gap: spacing[2] }}>
        {found.data?.map((person) => (
          <View key={person.id} role="listitem">
            <Button
              variant="secondary"
              label={`${person.name ?? t('admin:reports.unknown')} · ${t(`admin:users.state.${person.account_status as 'ACTIVE'}`, { defaultValue: person.account_status })}`}
              onPress={() => onSelect(person.id)}
              fullWidth
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewList({ userId, as }: { userId: string; as: 'reviewer' | 'reviewee' }) {
  const { t } = useTranslation('admin');
  const { spacing } = useTheme();
  const reviews = useReviewsOf(userId, as);
  const [note, setNote] = useState('');
  const toast = useToast();
  const change = useDecision(async (input: { review: AdminReview }) =>
    input.review.status === 'ACTIVE'
      ? hideReview(input.review.id, note)
      : restoreReview(input.review.id, note),
  );
  return (
    <Panel>
      <Text variant="label">{t(as === 'reviewer' ? 'users.written' : 'users.received')}</Text>
      {reviews.isPending ? <Skeleton height={40} radiusKey="md" /> : null}
      {reviews.data?.length === 0 ? <Text tone="secondary">{t('users.noReviews')}</Text> : null}
      {reviews.data && reviews.data.length > 0 ? (
        <TextField
          label={t('users.reviewNote')}
          value={note}
          onChangeText={(value) => setNote(value.slice(0, 1000))}
        />
      ) : null}
      {change.isError ? <Banner kind="danger" message={errorText(change.error)} /> : null}
      {reviews.data?.map((review) => (
        <View key={review.id} style={{ gap: spacing[1] }}>
          <Text variant="bodySm">
            {as === 'reviewer' ? review.reviewee_name : review.reviewer_name} · {review.event_title}{' '}
            · {t('users.score', { score: review.skill_score })}
            {review.fair_play ? ` · ${t('users.fairPlay')}` : ''} · {formatWhen(review.created_at)}
            {review.status === 'HIDDEN' ? ` · ${t('users.hidden')}` : ''}
          </Text>
          <Confirmed
            label={t(review.status === 'ACTIVE' ? 'users.hide' : 'users.restore')}
            disabled={note.trim().length === 0}
            pending={change.isPending}
            onConfirm={() =>
              change.mutate({ review }, { onSuccess: () => toast.show(t('users.done'), 'success') })
            }
          />
        </View>
      ))}
    </Panel>
  );
}

function PersonDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const user = useUser(id);
  const [note, setNote] = useState('');
  const change = useDecision(async (input: { suspend: boolean }) =>
    input.suspend ? suspendUser(id, note) : reinstateUser(id, note),
  );
  if (user.isError) {
    return (
      <View style={{ gap: spacing[2] }}>
        <Banner kind="danger" message={errorText(user.error)} />
        <Button variant="tertiary" label={t('admin:users.back')} onPress={onBack} />
      </View>
    );
  }
  if (!user.data) return <Skeleton height={160} radiusKey="md" />;
  const u = user.data;
  const suspended = u.account_status === 'SUSPENDED';
  const decide = (suspend: boolean) =>
    change.mutate(
      { suspend },
      {
        onSuccess: () => {
          toast.show(t('admin:users.done'), 'success');
          setNote('');
        },
      },
    );
  return (
    <View style={{ gap: spacing[3] }}>
      <Button variant="tertiary" label={t('admin:users.back')} onPress={onBack} />
      <Panel>
        <Text variant="title" heading={2}>
          {u.name ?? t('admin:reports.unknown')}
        </Text>
        <Text>
          {`${t('admin:users.status')}: ${t(`admin:users.state.${u.account_status as 'ACTIVE'}`, { defaultValue: u.account_status })}`}
          {u.is_admin ? ` · ${t('admin:users.admin')}` : ''}
        </Text>
        {u.bio ? <Text tone="secondary">{u.bio}</Text> : null}
        <Text variant="bodySm">{t('admin:users.joined', { count: u.events_joined })}</Text>
        <Text variant="bodySm">{t('admin:users.organized', { count: u.events_organized })}</Text>
        <Text variant="bodySm">
          {t('admin:users.reports', { open: u.reports_open, total: u.reports_total })}
        </Text>
        <Text variant="bodySm">{t('admin:users.noShows', { count: u.no_shows_30d })}</Text>
        <Text variant="bodySm">{t('admin:users.blockedBy', { count: u.blocked_by })}</Text>
        <Text variant="caption" tone="secondary">
          {t('admin:users.since', { date: formatWhen(u.created_at) })}
        </Text>
      </Panel>
      {u.account_status === 'ACTIVE' || suspended ? (
        <Panel>
          {change.isError ? <Banner kind="danger" message={errorText(change.error)} /> : null}
          <TextField
            label={t('admin:users.suspendNote')}
            value={note}
            onChangeText={(value) => setNote(value.slice(0, 1000))}
            multiline
          />
          <Confirmed
            variant={suspended ? 'secondary' : 'destructive'}
            label={t(suspended ? 'admin:users.reinstate' : 'admin:users.suspend')}
            disabled={note.trim().length === 0 || (!suspended && u.is_admin)}
            pending={change.isPending}
            onConfirm={() => decide(!suspended)}
          />
        </Panel>
      ) : null}
      {u.history.length > 0 ? (
        <Panel>
          <Text variant="label">{t('admin:users.history')}</Text>
          {u.history.map((h) => (
            <Text key={h.id} variant="bodySm">
              {formatWhen(h.created_at)} ·{' '}
              {t(`admin:audit.action.${h.action as 'REPORT_RESOLVED'}`, { defaultValue: h.action })}
              {h.note ? ` · ${h.note}` : ''}
            </Text>
          ))}
        </Panel>
      ) : null}
      <ReviewList userId={id} as="reviewer" />
      <ReviewList userId={id} as="reviewee" />
    </View>
  );
}
