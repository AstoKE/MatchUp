import { useTranslation } from 'react-i18next';
import { currentLocale } from '@/lib/i18n';
import { Select, Text } from '@/ui';
import type { CatalogCity } from './api/catalog-api';
import { localizedName } from './localized';
import { usePlaceSearch } from './place-search';

/** Optional city + district. Choosing another city clears the district (it must belong to the city). */
export function LocationFields({
  cities,
  cityId,
  districtId,
  onChange,
  districtError,
}: {
  cities: readonly CatalogCity[];
  cityId: string | null;
  districtId: string | null;
  onChange: (next: { cityId: string | null; districtId: string | null }) => void;
  districtError?: string;
}) {
  const { t } = useTranslation('profile');
  const locale = currentLocale();
  const city = cities.find((c) => c.id === cityId);
  const search = usePlaceSearch();
  return (
    <>
      <Select
        label={t('city')}
        placeholder={t('notSet')}
        noneLabel={t('notSet')}
        value={cityId}
        search={search}
        options={cities.map((c) => ({ value: c.id, label: localizedName(c.names, locale) }))}
        onChange={(next) =>
          onChange({ cityId: next, districtId: next === cityId ? districtId : null })
        }
      />
      <Select
        label={t('district')}
        placeholder={t('notSet')}
        noneLabel={t('notSet')}
        value={districtId}
        disabled={!city}
        search={search}
        options={(city?.districts ?? []).map((d) => ({
          value: d.id,
          label: localizedName(d.names, locale),
        }))}
        onChange={(next) => onChange({ cityId, districtId: next })}
        error={districtError}
      />
      <Text variant="caption" tone="secondary">
        {t('locationHint')}
      </Text>
    </>
  );
}
