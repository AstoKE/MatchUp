import {
  activeFilterCount,
  DATE_PRESETS,
  EMPTY_DISCOVER_FILTERS,
  TIME_OF_DAY_PARTS,
  type DiscoverFilters as Filters,
  type TimeOfDay,
} from '@matchup/domain';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type CatalogCity, type CatalogSport } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Button, Checkbox, SegmentedChoice, Select, Text, ToggleChip, useTheme } from '@/ui';

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** The Discover filter panel: single-choice day, multi-choice parts of the day and sports, district, open slots. */
export function DiscoverFilters({
  filters,
  onChange,
  sports,
  city,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  sports: readonly CatalogSport[];
  city: CatalogCity | undefined;
}) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const locale = currentLocale();
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <View role="group" accessibilityLabel={t('discover.filtersTitle')} style={{ gap: spacing[4] }}>
      <SegmentedChoice
        label={t('discover.datePreset')}
        options={DATE_PRESETS.map((value) => ({ value, label: t(`discover.date.${value}`) }))}
        value={filters.datePreset}
        onChange={(datePreset) => set({ datePreset })}
      />

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" tone="secondary">
          {t('discover.timeOfDayTitle')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {TIME_OF_DAY_PARTS.map((part: TimeOfDay) => (
            <ToggleChip
              key={part}
              label={t(`discover.timeOfDay.${part}`)}
              selected={filters.timeOfDay.includes(part)}
              onPress={() => set({ timeOfDay: toggle(filters.timeOfDay, part) })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing[2] }}>
        <Text variant="label" tone="secondary">
          {t('discover.sportsTitle')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {sports.map((sport) => (
            <ToggleChip
              key={sport.id}
              label={localizedName(sport.names, locale)}
              selected={filters.sportIds.includes(sport.id)}
              onPress={() => set({ sportIds: toggle(filters.sportIds, sport.id) })}
            />
          ))}
        </View>
      </View>

      {city ? (
        <Select
          label={t('discover.district')}
          placeholder={t('discover.districtPlaceholder')}
          noneLabel={t('discover.districtAny')}
          options={city.districts.map((d) => ({
            value: d.id,
            label: localizedName(d.names, locale),
          }))}
          value={filters.districtId}
          onChange={(districtId) => set({ districtId })}
        />
      ) : null}

      <Checkbox
        label={t('discover.onlyOpen')}
        checked={filters.onlyOpen}
        onChange={(onlyOpen) => set({ onlyOpen })}
      />

      {activeFilterCount(filters) > 0 ? (
        <Button
          label={t('discover.clear')}
          variant="tertiary"
          onPress={() => onChange(EMPTY_DISCOVER_FILTERS)}
        />
      ) : null}
    </View>
  );
}
