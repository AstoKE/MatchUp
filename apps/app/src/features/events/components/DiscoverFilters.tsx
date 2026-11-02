import {
  activeFilterCount,
  DATE_PRESETS,
  EMPTY_DISCOVER_FILTERS,
  TIME_OF_DAY_PARTS,
  type DiscoverFilters as Filters,
  type TimeOfDay,
} from '@matchup/domain';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type CatalogCity } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Button, SegmentedChoice, Select, Sheet, Text, ToggleChip, useTheme } from '@/ui';

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Discover's filters (docs/design.md §5.1): the frequent ones up front (day, open spots), the rest
 * in a sheet behind a button that shows how many filters are active. Same filters as before, on every screen size.
 */
export function DiscoverFilters({
  filters,
  onChange,
  city,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  city: CatalogCity | undefined;
}) {
  const { t } = useTranslation('events');
  const { spacing, breakpoint } = useTheme();
  const compact = breakpoint === 'compact';
  const [open, setOpen] = useState(false);
  const locale = currentLocale();
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const count = activeFilterCount(filters);
  const chips = (
    <>
      <Button
        variant="secondary"
        label={count > 0 ? t('discover.filtersWithCount', { count }) : t('discover.filtersTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPress={() => setOpen(true)}
      />
      {DATE_PRESETS.filter((value) => value !== 'ANY').map((value) => (
        <ToggleChip
          key={value}
          label={t(`discover.date.${value}`)}
          selected={filters.datePreset === value}
          onPress={() => set({ datePreset: filters.datePreset === value ? 'ANY' : value })}
        />
      ))}
      <ToggleChip
        label={t('discover.onlyOpen')}
        selected={filters.onlyOpen}
        onPress={() => set({ onlyOpen: !filters.onlyOpen })}
      />
    </>
  );

  return (
    <View role="group" accessibilityLabel={t('discover.filtersTitle')} style={{ gap: spacing[2] }}>
      {/* One scrolling line on a phone; a mouse cannot scroll a line whose bar is hidden, so wider screens wrap. */}
      {compact ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing[2], alignItems: 'center' }}
        >
          {chips}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>{chips}</View>
      )}
      {count > 0 ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            label={t('discover.clear')}
            variant="tertiary"
            onPress={() => onChange(EMPTY_DISCOVER_FILTERS)}
          />
        </View>
      ) : null}

      <Sheet
        visible={open}
        title={t('discover.filtersTitle')}
        onClose={() => setOpen(false)}
        closeLabel={t('discover.filtersClose')}
        footer={
          <Button label={t('discover.filtersDone')} onPress={() => setOpen(false)} fullWidth />
        }
      >
        <View style={{ gap: spacing[4] }}>
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
          <SegmentedChoice
            label={t('discover.setting')}
            value={filters.setting ?? 'ANY'}
            onChange={(value) => set({ setting: value === 'ANY' ? null : value })}
            options={[
              { value: 'ANY', label: t('discover.settingAny') },
              { value: 'INDOOR', label: t('setting.INDOOR') },
              { value: 'OUTDOOR', label: t('setting.OUTDOOR') },
            ]}
          />
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
        </View>
      </Sheet>
    </View>
  );
}
