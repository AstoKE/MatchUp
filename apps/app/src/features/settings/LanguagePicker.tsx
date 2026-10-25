import { SUPPORTED_LOCALES } from '@matchup/config';
import { useTranslation } from 'react-i18next';
import { currentLocale, setLocale } from '@/lib/i18n';
import { SegmentedChoice } from '@/ui';

/** In-app language choice (Turkish / English). Each language is named in itself. */
export function LanguagePicker() {
  const { t, i18n } = useTranslation('common');
  // Reading i18n.language makes the component re-render when the language changes.
  void i18n.language;
  return (
    <SegmentedChoice
      label={t('language')}
      value={currentLocale()}
      options={SUPPORTED_LOCALES.map((value) => ({ value, label: t(`languages.${value}`) }))}
      onChange={setLocale}
    />
  );
}
