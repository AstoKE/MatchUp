import {
  confidenceBand,
  levelFromXp,
  showsReliabilityPercentage,
  xpRequiredForLevel,
} from '@matchup/domain';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type Catalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import { EmptyState, Skeleton, Text, useTheme } from '@/ui';
import type { MyProfile } from '../api/profile-api';
import { useMyProgress } from '../hooks';
import { BadgeIcon } from './BadgeIcon';

/**
 * Skill, reliability and XP stay three separate things on screen too (RATING_SYSTEM §1). The copy says a skill
 * rating is player feedback, never a measurement (§9), and a low-confidence one is provisional (§3.4).
 */
export function ProgressSection({ profile, catalog }: { profile: MyProfile; catalog: Catalog }) {
  const { t } = useTranslation(['profile', 'common']);
  const { spacing, colors, radius } = useTheme();
  const locale = currentLocale();
  const progress = useMyProgress();

  if (progress.isPending) {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
        <Skeleton height={96} radiusKey="lg" />
      </View>
    );
  }
  if (progress.isError) {
    return (
      <EmptyState
        title={t('profile:progress.loadFailed')}
        body={errorText(progress.error)}
        actionLabel={t('common:retry')}
        onAction={() => void progress.refetch()}
      />
    );
  }

  const { xpTotal, reliability, ratings, badges } = progress.data;
  const level = levelFromXp(xpTotal);
  const levelStart = xpRequiredForLevel(level);
  const levelEnd = xpRequiredForLevel(level + 1);
  const toNext = levelEnd - xpTotal;
  const share = Math.round(((xpTotal - levelStart) / (levelEnd - levelStart)) * 100);
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const box = {
    gap: spacing[1],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceRaised,
  };
  const sportName = (id: string | null) => {
    const sport = catalog.sports.find((s) => s.id === id);
    return sport ? localizedName(sport.names, locale) : '';
  };

  return (
    <View style={{ gap: spacing[5] }}>
      <View style={{ gap: spacing[3] }}>
        <Text variant="title" heading={2}>
          {t('profile:progress.title')}
        </Text>
        <View accessible style={[box, { gap: spacing[2] }]}>
          <Text variant="titleSm">{t('profile:progress.level', { level })}</Text>
          {/* The numbers stay in text below: the bar is the same fact, for the eye. */}
          <View
            testID="level-bar"
            role="progressbar"
            aria-label={t('profile:progress.barLabel', { level: level + 1 })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={share}
            style={{
              height: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surfaceSunken,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${share}%`,
                height: '100%',
                backgroundColor: colors.actionPrimary,
              }}
            />
          </View>
          <Text variant="caption" tone="secondary">
            {t('profile:progress.xp', { xp: xpTotal, next: toNext })}
          </Text>
        </View>
        <View accessible style={box}>
          <Text variant="label" tone="secondary">
            {t('profile:progress.reliability')}
          </Text>
          {reliability && showsReliabilityPercentage(reliability.samples) ? (
            <>
              <Text variant="titleSm">{percent.format(reliability.score)}</Text>
              <Text variant="caption" tone="secondary">
                {t(`profile:progress.confidence.${confidenceBand(reliability.confidence)}`)}
              </Text>
            </>
          ) : (
            <Text variant="titleSm">{t('profile:progress.newPlayer')}</Text>
          )}
        </View>
      </View>

      <View style={{ gap: spacing[3] }}>
        <Text variant="title" heading={2}>
          {t('profile:progress.skillTitle')}
        </Text>
        <Text variant="caption" tone="secondary">
          {t('profile:progress.skillNote')}
        </Text>
        {ratings.length === 0 ? (
          <Text tone="secondary">{t('profile:progress.noRatings')}</Text>
        ) : (
          <View role="list" style={{ gap: spacing[2] }}>
            {ratings.map((r) => {
              const low = confidenceBand(r.confidence) === 'LOW';
              const own = profile.sports.find((s) => s.sportId === r.sportId);
              return (
                <View key={r.sportId} role="listitem" accessible style={box}>
                  <Text variant="label">
                    {t('profile:progress.rating', {
                      sport: sportName(r.sportId),
                      rating: number.format(r.rating),
                    })}
                  </Text>
                  {low ? (
                    <Text variant="caption" tone="secondary">
                      {own
                        ? t('profile:progress.provisionalWithOwn', {
                            own: number.format(own.level),
                          })
                        : t('profile:progress.provisional')}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={{ gap: spacing[3] }}>
        <Text variant="title" heading={2}>
          {t('profile:progress.badgesTitle')}
        </Text>
        {badges.length === 0 ? (
          <Text tone="secondary">{t('profile:progress.noBadges')}</Text>
        ) : (
          <View role="list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
            {badges.map((b) => (
              <View
                key={`${b.code}:${b.sportId ?? ''}`}
                role="listitem"
                accessible
                style={{ flexBasis: '30%', flexGrow: 1, alignItems: 'center', gap: spacing[1] }}
              >
                <BadgeIcon
                  code={b.code}
                  sportSlug={catalog.sports.find((s) => s.id === b.sportId)?.slug}
                />
                <Text variant="label" style={{ textAlign: 'center' }}>
                  {localizedName(b.names, locale).replace('{sport}', sportName(b.sportId))}
                </Text>
                <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                  {localizedName(b.descriptions, locale)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
