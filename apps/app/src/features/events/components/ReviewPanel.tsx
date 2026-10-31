import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type LocalizedName } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  Checkbox,
  EmptyState,
  SegmentedChoice,
  Skeleton,
  Text,
  useTheme,
  useToast,
} from '@/ui';
import type { EventReviews } from '../api/reviews-api';
import { formatEventStart } from '../format';
import { useEventReviews, useSubmitReviews } from '../hooks';

const SCORES = ['1', '2', '3', '4', '5'] as const;
type Score = (typeof SCORES)[number];

/**
 * Double-blind peer reviews after a finalized event (RATING_SYSTEM §3.3). Only the scores the player chose
 * are sent, so they can review some people now and the rest later; a sent review cannot be changed.
 */
export function ReviewPanel({
  eventId,
  timeZone,
  descriptors,
}: {
  eventId: string;
  timeZone: string;
  descriptors: Record<string, LocalizedName>;
}) {
  const { t } = useTranslation(['events', 'common']);
  const reviews = useEventReviews(eventId, true);

  if (reviews.isPending) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
        <Skeleton height={96} radiusKey="lg" />
      </View>
    );
  }
  if (reviews.isError) {
    return (
      <EmptyState
        title={t('events:reviews.loadFailed')}
        body={errorText(reviews.error)}
        actionLabel={t('common:retry')}
        onAction={() => void reviews.refetch()}
      />
    );
  }
  if (!reviews.data.canReview) return null;
  return (
    <ReviewForm
      eventId={eventId}
      timeZone={timeZone}
      descriptors={descriptors}
      data={reviews.data}
    />
  );
}

function ReviewForm({
  eventId,
  timeZone,
  descriptors,
  data,
}: {
  eventId: string;
  timeZone: string;
  descriptors: Record<string, LocalizedName>;
  data: EventReviews;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const locale = currentLocale();
  const submit = useSubmitReviews(eventId);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [fair, setFair] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const open = data.targets.filter((target) => !target.reviewed);
  const chosen = open.filter((target) => scores[target.userId] !== undefined);

  const title = (
    <Text variant="title" heading={2}>
      {t('events:reviews.title')}
    </Text>
  );
  if (!data.windowOpen) {
    return (
      <View style={{ gap: spacing[3] }}>
        {title}
        <Text tone="secondary">{t('events:reviews.closed')}</Text>
      </View>
    );
  }
  if (data.targets.length === 0) return null;

  return (
    <View style={{ gap: spacing[4] }}>
      {title}
      <Text tone="secondary">{t('events:reviews.blind')}</Text>
      {data.windowClosesAt ? (
        <Text variant="caption" tone="secondary">
          {t('events:reviews.until', {
            date: formatEventStart(data.windowClosesAt, timeZone, locale),
          })}
        </Text>
      ) : null}
      {open.length > 0 ? (
        <View role="list" style={{ gap: spacing[1] }}>
          {SCORES.map((score) =>
            descriptors[score] ? (
              <View key={score} role="listitem">
                <Text variant="caption" tone="secondary">
                  {t('events:reviews.anchor', {
                    score,
                    text: localizedName(descriptors[score], locale),
                  })}
                </Text>
              </View>
            ) : null,
          )}
        </View>
      ) : null}
      {error ? <Banner kind="danger" message={error} /> : null}
      <View role="list" style={{ gap: spacing[4] }}>
        {data.targets.map((target) => {
          const name = target.displayName ?? t('events:requests.unnamed');
          return (
            <View key={target.userId} role="listitem" style={{ gap: spacing[2] }}>
              {target.reviewed ? (
                <Text>{t('events:reviews.done', { name })}</Text>
              ) : (
                <>
                  <SegmentedChoice<Score | ''>
                    label={name}
                    value={scores[target.userId] ?? ''}
                    options={SCORES.map((value) => ({ value, label: value }))}
                    onChange={(value) => {
                      if (value) setScores((s) => ({ ...s, [target.userId]: value }));
                    }}
                  />
                  <Checkbox
                    label={t('events:reviews.fairPlay', { name })}
                    checked={fair[target.userId] ?? false}
                    onChange={(checked) => setFair((f) => ({ ...f, [target.userId]: checked }))}
                  />
                </>
              )}
            </View>
          );
        })}
      </View>
      {open.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="caption" tone="secondary">
            {t('events:reviews.final')}
          </Text>
          <Button
            label={t('events:reviews.send', { count: chosen.length })}
            disabled={chosen.length === 0}
            loading={submit.isPending}
            loadingLabel={t('common:loading')}
            onPress={() => {
              setError(null);
              submit.mutate(
                {
                  eventId,
                  reviews: chosen.map((target) => ({
                    revieweeId: target.userId,
                    score: Number(scores[target.userId]),
                    fairPlay: fair[target.userId] ?? false,
                  })),
                },
                {
                  onSuccess: () => toast.show(t('events:reviews.sentToast'), 'success'),
                  onError: (failure) => setError(errorText(failure)),
                },
              );
            }}
            fullWidth
          />
        </View>
      ) : (
        <Text tone="secondary">{t('events:reviews.allDone')}</Text>
      )}
    </View>
  );
}
