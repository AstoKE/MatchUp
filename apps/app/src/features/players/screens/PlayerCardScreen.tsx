import { levelFromXp } from '@matchup/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { RequireOnboarded } from '@/features/onboarding';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Avatar,
  Banner,
  Button,
  EmptyState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@/ui';
import type { PlayerCard } from '../api/players-api';
import { ReportSheet } from '../components/ReportSheet';
import { useBlockUser, usePlayerCard } from '../hooks';

/**
 * Another player, as they chose to be seen (docs/PHASE6_PLAN.md M3): the server leaves out what their settings hide. Report and
 * block live here. "Not available" is the only answer for someone blocked, private or gone, so it reveals none of them.
 */
export function PlayerCardScreen() {
  return (
    <RequireOnboarded>
      <Content />
    </RequireOnboarded>
  );
}

function Content() {
  const { t } = useTranslation(['players', 'common']);
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const card = usePlayerCard(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (card.isPending) {
    return (
      <Screen maxWidth={640}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }
  if (card.isError) {
    return (
      <Screen maxWidth={640}>
        <ScreenHeader title={t('players:title')} backLabel={t('common:back')} onBack={back} />
        <EmptyState title={t('players:unavailable')} body={errorText(card.error)} />
      </Screen>
    );
  }
  return <Card card={card.data} onBack={back} />;
}

function Card({ card, onBack }: { card: PlayerCard; onBack: () => void }) {
  const { t } = useTranslation(['players', 'profile', 'common']);
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const catalog = useCatalog();
  const block = useBlockUser();
  const locale = currentLocale();
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = card.displayName ?? t('players:unnamed');
  const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const sportOf = (sportId: string | null) => {
    const sport = catalog.data?.sports.find((s) => s.id === sportId);
    return sport ? localizedName(sport.names, locale) : '';
  };
  const box = {
    gap: spacing[1],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceRaised,
  };

  return (
    <Screen maxWidth={640}>
      <ScreenHeader title={name} backLabel={t('common:back')} onBack={onBack} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Avatar name={name} />
        {card.xpTotal !== null ? (
          <Text variant="titleSm">
            {t('profile:progress.level', { level: levelFromXp(card.xpTotal) })}
          </Text>
        ) : null}
      </View>
      {card.bio ? <Text>{card.bio}</Text> : null}
      {error ? <Banner kind="danger" message={error} /> : null}

      {card.reliability !== null ? (
        <View accessible style={box}>
          <Text variant="caption" tone="secondary">
            {t('profile:progress.reliability')}
          </Text>
          <Text variant="titleSm">{percent.format(card.reliability)}</Text>
        </View>
      ) : null}

      {card.sports.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="title" heading={2}>
            {t('players:sports')}
          </Text>
          <View role="list" style={{ gap: spacing[2] }}>
            {card.sports.map((s) => (
              <View key={s.sportId} role="listitem" accessible style={box}>
                <Text variant="label">{sportOf(s.sportId)}</Text>
                <Text variant="caption" tone="secondary">
                  {[
                    t('players:ownLevel', { level: decimal.format(s.level) }),
                    s.rating !== null
                      ? t('players:rating', { rating: decimal.format(s.rating) })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" tone="secondary">
            {t('profile:progress.skillNote')}
          </Text>
        </View>
      ) : null}

      {card.badges.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="title" heading={2}>
            {t('profile:progress.badgesTitle')}
          </Text>
          <View role="list" style={{ gap: spacing[1] }}>
            {card.badges.map((b) => (
              <View key={`${b.code}:${b.sportId ?? ''}`} role="listitem">
                <Text>{localizedName(b.names, locale).replace('{sport}', sportOf(b.sportId))}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {card.isMe ? null : (
        <View style={{ gap: spacing[2] }}>
          <Button
            variant="secondary"
            label={t('players:report.open')}
            onPress={() => setReporting(true)}
            fullWidth
          />
          {confirming ? (
            <View style={{ gap: spacing[2] }}>
              <Text role="alert">{t('players:block.confirm', { name })}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                <Button
                  variant="destructive"
                  label={t('players:block.yes')}
                  loading={block.isPending}
                  loadingLabel={t('common:loading')}
                  onPress={() => {
                    setError(null);
                    block.mutate(card.userId, {
                      onSuccess: () => {
                        toast.show(t('players:block.done', { name }), 'success');
                        router.replace('/');
                      },
                      onError: (failure) => setError(errorText(failure)),
                    });
                  }}
                />
                <Button
                  variant="secondary"
                  label={t('common:cancel')}
                  onPress={() => setConfirming(false)}
                />
              </View>
            </View>
          ) : (
            <Button
              variant="destructive"
              label={t('players:block.open')}
              onPress={() => setConfirming(true)}
              fullWidth
            />
          )}
        </View>
      )}
      <ReportSheet
        visible={reporting}
        targetType="USER"
        targetId={card.userId}
        onClose={() => setReporting(false)}
      />
    </Screen>
  );
}
