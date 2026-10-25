import { MAX_POSITIONS_PER_SPORT, SKILL_LEVELS, type SportSelection } from '@matchup/domain';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '@/lib/i18n';
import { Text, ToggleChip, TOUCH_TARGET, useTheme } from '@/ui';
import type { CatalogSport } from './api/catalog-api';
import { localizedName } from './localized';

const DEFAULT_LEVEL = 3;

/**
 * Chooses sports, a self-assessed level for each (half steps) and optional positions. Controlled:
 * the parent owns the list and validates it with `@matchup/domain` before sending it to the server.
 */
export function SportPicker({
  sports,
  value,
  onChange,
}: {
  sports: readonly CatalogSport[];
  value: readonly SportSelection[];
  onChange: (next: SportSelection[]) => void;
}) {
  const { t } = useTranslation('profile');
  const { spacing } = useTheme();
  const locale = currentLocale();
  const selectedById = new Map(value.map((entry) => [entry.sportId, entry]));

  const toggleSport = (sportId: string) => {
    onChange(
      selectedById.has(sportId)
        ? value.filter((entry) => entry.sportId !== sportId)
        : [...value, { sportId, level: DEFAULT_LEVEL, positionIds: [] }],
    );
  };
  const update = (sportId: string, patch: Partial<SportSelection>) =>
    onChange(value.map((entry) => (entry.sportId === sportId ? { ...entry, ...patch } : entry)));

  return (
    <View style={{ gap: spacing[4] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {sports.map((sport) => (
          <ToggleChip
            key={sport.id}
            label={localizedName(sport.names, locale)}
            selected={selectedById.has(sport.id)}
            onPress={() => toggleSport(sport.id)}
          />
        ))}
      </View>
      {sports
        .filter((sport) => selectedById.has(sport.id))
        .map((sport) => {
          const entry = selectedById.get(sport.id)!;
          return (
            <SportCard
              key={sport.id}
              sport={sport}
              entry={entry}
              locale={locale}
              onLevel={(level) => update(sport.id, { level })}
              onPositions={(positionIds) => update(sport.id, { positionIds })}
              labels={{
                level: t('level'),
                value: t('levelValue', { value: entry.level }),
                lower: t('levelLower'),
                higher: t('levelHigher'),
                positions: t('positions', { max: MAX_POSITIONS_PER_SPORT }),
              }}
            />
          );
        })}
    </View>
  );
}

function SportCard({
  sport,
  entry,
  locale,
  onLevel,
  onPositions,
  labels,
}: {
  sport: CatalogSport;
  entry: SportSelection;
  locale: 'tr' | 'en';
  onLevel: (level: SportSelection['level']) => void;
  onPositions: (ids: string[]) => void;
  labels: { level: string; value: string; lower: string; higher: string; positions: string };
}) {
  const { colors, radius, spacing } = useTheme();
  const descriptor = sport.skillDescriptors[String(Math.floor(entry.level))];
  const atMax = entry.positionIds.length >= MAX_POSITIONS_PER_SPORT;
  // Moves to the neighbouring allowed level (half steps), never to an arbitrary number.
  const levelIndex = SKILL_LEVELS.indexOf(entry.level);
  const lowerLevel = SKILL_LEVELS[levelIndex - 1];
  const higherLevel = SKILL_LEVELS[levelIndex + 1];

  return (
    <View
      style={{
        gap: spacing[3],
        padding: spacing[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text variant="title" heading={3}>
        {localizedName(sport.names, locale)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <StepButton
          label={labels.lower}
          symbol="−"
          disabled={lowerLevel === undefined}
          onPress={() => lowerLevel !== undefined && onLevel(lowerLevel)}
        />
        <Text
          accessibilityLabel={labels.value}
          accessibilityLiveRegion="polite"
          style={{ minWidth: 96, textAlign: 'center' }}
        >
          {labels.value}
        </Text>
        <StepButton
          label={labels.higher}
          symbol="+"
          disabled={higherLevel === undefined}
          onPress={() => higherLevel !== undefined && onLevel(higherLevel)}
        />
      </View>
      {descriptor ? (
        <Text variant="caption" tone="secondary">
          {localizedName(descriptor, locale)}
        </Text>
      ) : null}
      {sport.positions.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label">{labels.positions}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {sport.positions.map((position) => {
              const selected = entry.positionIds.includes(position.id);
              return (
                <ToggleChip
                  key={position.id}
                  label={localizedName(position.names, locale)}
                  selected={selected}
                  disabled={!selected && atMax}
                  onPress={() =>
                    onPositions(
                      selected
                        ? entry.positionIds.filter((id) => id !== position.id)
                        : [...entry.positionIds, position.id],
                    )
                  }
                />
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StepButton({
  label,
  symbol,
  disabled,
  onPress,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: TOUCH_TARGET,
        height: TOUCH_TARGET,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text variant="title" accessibilityElementsHidden importantForAccessibility="no">
        {symbol}
      </Text>
    </Pressable>
  );
}
