import {
  activeFilterCount,
  DATE_PRESETS,
  EMPTY_DISCOVER_FILTERS,
  TIME_OF_DAY_PARTS,
  utcToZonedParts,
  type DiscoverFilters as Filters,
  type TimeOfDay,
} from '@matchup/domain';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  localizedName,
  usePlaceSearch,
  type CatalogCity,
  type CatalogSport,
} from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Button, SegmentedChoice, Select, Sheet, Text, ToggleChip, useTheme } from '@/ui';
import { SportGrid } from './DiscoverSports';
import { DateWheel } from './WhenWheels';

/** How far ahead the date wheel of Discover goes. */
const DISCOVER_DAYS_AHEAD = 90;

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
  sport,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  city: CatalogCity | undefined;
  /** The sport choice, shown again as court tiles at the top of the sheet; it stays out of the filter count. */
  sport?: { sports: readonly CatalogSport[]; choice: string; onChoose: (choice: string) => void };
}) {
  const { t } = useTranslation('events');
  const { spacing, breakpoint } = useTheme();
  const compact = breakpoint === 'compact';
  const [open, setOpen] = useState(false);
  const locale = currentLocale();
  const search = usePlaceSearch();
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const count = activeFilterCount(filters);
  const timeZone = city?.timeZone ?? 'Europe/Istanbul';
  const today = utcToZonedParts(new Date().toISOString(), timeZone).date;
  const [dayOpen, setDayOpen] = useState(false);
  const [draftDay, setDraftDay] = useState(today);
  const dayFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const dayLabel = (iso: string) => dayFormat.format(new Date(`${iso}T12:00:00Z`));
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
          selected={filters.day === null && filters.datePreset === value}
          onPress={() =>
            set({
              day: null,
              datePreset: filters.day === null && filters.datePreset === value ? 'ANY' : value,
            })
          }
        />
      ))}
      {/* Selected like the other day chips once a day is picked; it always opens the wheel. */}
      <ToggleChip
        label={
          filters.day === null
            ? t('discover.date.pick')
            : t('discover.date.picked', { day: dayLabel(filters.day) })
        }
        selected={filters.day !== null}
        onPress={() => {
          setDraftDay(filters.day ?? today);
          setDayOpen(true);
        }}
      />
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
          {sport ? <SportGrid {...sport} /> : null}
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
              search={search}
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

      <Sheet
        visible={dayOpen}
        title={t('discover.date.pickTitle')}
        onClose={() => setDayOpen(false)}
        closeLabel={t('discover.filtersClose')}
        footer={
          <View style={{ gap: spacing[2] }}>
            <Button
              label={t('discover.date.apply')}
              fullWidth
              onPress={() => {
                set({ day: draftDay, datePreset: 'ANY' });
                setDayOpen(false);
              }}
            />
            {filters.day !== null ? (
              <Button
                variant="tertiary"
                label={t('discover.date.anyDay')}
                onPress={() => {
                  set({ day: null });
                  setDayOpen(false);
                }}
              />
            ) : null}
          </View>
        }
      >
        <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center' }}>
          <DateWheel
            from={today}
            days={DISCOVER_DAYS_AHEAD}
            value={draftDay}
            onChange={setDraftDay}
          />
        </View>
      </Sheet>
    </View>
  );
}
