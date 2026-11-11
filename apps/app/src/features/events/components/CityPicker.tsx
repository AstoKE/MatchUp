import { filterByName } from '@matchup/domain';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type CatalogCity } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Button, Sheet, Text, TextField, TOUCH_TARGET, useTheme } from '@/ui';

/**
 * The province Discover shows, at the top of the screen (ADR-0024 §6): a button with its name that opens a sheet with
 * a filter box and the 81 provinces in Turkish alphabetical order.
 */
export function CityPicker({
  cities,
  cityId,
  onChange,
}: {
  cities: readonly CatalogCity[];
  cityId: string | null;
  onChange: (cityId: string) => void;
}) {
  const { t } = useTranslation(['events', 'common']);
  const { colors, radius, spacing } = useTheme();
  const locale = currentLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = cities.find((c) => c.id === cityId);
  const options = cities.map((c) => ({ value: c.id, label: localizedName(c.names, locale) }));
  const shown = filterByName(options, query);
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        // With nothing chosen yet (a form), the name says what to do instead of "İl: . Değiştir".
        accessibilityLabel={
          current
            ? t('events:discover.cityButton', { city: localizedName(current.names, locale) })
            : t('events:discover.cityPick')
        }
        aria-expanded={open}
        onPress={() => setOpen(true)}
        style={{
          minHeight: TOUCH_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[1],
          paddingHorizontal: spacing[1],
        }}
      >
        <Text variant="label" tone="secondary">
          {current ? localizedName(current.names, locale) : t('events:discover.cityPick')}
        </Text>
        <Text tone="secondary" accessibilityElementsHidden importantForAccessibility="no">
          {'▾'}
        </Text>
      </Pressable>
      <Sheet
        visible={open}
        title={t('events:discover.cityTitle')}
        onClose={close}
        closeLabel={t('common:close')}
        footer={<Button label={t('common:close')} variant="secondary" onPress={close} fullWidth />}
      >
        <TextField
          label={t('common:search')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <View accessibilityRole="radiogroup" accessibilityLabel={t('events:discover.cityTitle')}>
          {shown.length === 0 ? (
            <Text tone="secondary" accessibilityLiveRegion="polite" style={{ padding: spacing[3] }}>
              {t('common:noMatch')}
            </Text>
          ) : null}
          {shown.map((option) => {
            const selected = option.value === cityId;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                aria-checked={selected}
                onPress={() => {
                  onChange(option.value);
                  close();
                }}
                style={{
                  minHeight: TOUCH_TARGET,
                  justifyContent: 'center',
                  paddingHorizontal: spacing[3],
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.surfaceSunken : 'transparent',
                }}
              >
                <Text variant={selected ? 'label' : 'body'}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}
