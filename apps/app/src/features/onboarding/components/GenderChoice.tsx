import { GENDERS, type Gender } from '@matchup/domain';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, ToggleChip, useTheme } from '@/ui';

/** Woman / man / rather not say. Private: it only chooses which avatars are offered first (ADR-0027). */
export function GenderChoice({
  value,
  onChange,
  error,
}: {
  value: Gender | null;
  onChange: (gender: Gender) => void;
  error?: string;
}) {
  const { t } = useTranslation('profile');
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text variant="label" nativeID="gender-label">
        {t('gender.label')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('gender.hint')}
      </Text>
      <View
        role="radiogroup"
        aria-labelledby="gender-label"
        accessibilityLabel={t('gender.label')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}
      >
        {GENDERS.map((gender) => (
          <ToggleChip
            key={gender}
            radio
            label={t(`gender.${gender}`)}
            selected={value === gender}
            onPress={() => onChange(gender)}
          />
        ))}
      </View>
      {error ? (
        <Text tone="danger" role="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
