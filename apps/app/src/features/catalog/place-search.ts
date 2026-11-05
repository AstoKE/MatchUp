import { useTranslation } from 'react-i18next';

/** The filter box of the province and district pickers (81 provinces, up to 39 districts). */
export function usePlaceSearch(): { label: string; noMatch: string } {
  const { t } = useTranslation('common');
  return { label: t('search'), noMatch: t('noMatch') };
}
