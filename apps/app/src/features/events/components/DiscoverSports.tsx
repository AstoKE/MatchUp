import { useRef, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type CatalogSport } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Button, CourtTile, SportDot, Text, ToggleChip, useTheme } from '@/ui';
import { ALL_SPORTS } from '../discover-sport-preference';

/** What Discover shows before the first choice: every sport the app has, and "all of them". */
export function SportPicker({
  sports,
  onChoose,
}: {
  sports: readonly CatalogSport[];
  onChoose: (choice: string) => void;
}) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const locale = currentLocale();
  return (
    <View style={{ gap: spacing[3] }}>
      <View style={{ gap: spacing[1] }}>
        <Text variant="title" heading={2}>
          {t('discover.pickerTitle')}
        </Text>
        <Text tone="secondary">{t('discover.pickerHint')}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {sports.map((sport) => (
          <CourtTile
            key={sport.id}
            label={localizedName(sport.names, locale)}
            slug={sport.slug}
            onPress={() => onChoose(sport.id)}
          />
        ))}
      </View>
      <Button
        variant="tertiary"
        label={t('discover.allSports')}
        onPress={() => onChoose(ALL_SPORTS)}
      />
    </View>
  );
}

/** The way to another sport once one is chosen, always above the list. */
export function SportStrip({
  sports,
  choice,
  onChoose,
}: {
  sports: readonly CatalogSport[];
  choice: string;
  onChoose: (choice: string) => void;
}) {
  const { t } = useTranslation('events');
  const { spacing, breakpoint } = useTheme();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const locale = currentLocale();
  const compact = breakpoint === 'compact';
  const chip = (id: string, label: string, slug?: string) => (
    <View
      key={id}
      // A remembered sport can be far along the line, out of view.
      onLayout={
        compact && id === choice
          ? (e) => scroller.current?.scrollTo({ x: e.nativeEvent.layout.x, animated: false })
          : undefined
      }
    >
      <ToggleChip
        radio
        label={label}
        icon={slug ? () => <SportDot slug={slug} /> : undefined}
        selected={id === choice}
        onPress={() => onChoose(id)}
      />
    </View>
  );
  const chips = (
    <>
      {chip(ALL_SPORTS, t('discover.allSports'))}
      {sports.map((sport) => chip(sport.id, localizedName(sport.names, locale), sport.slug))}
    </>
  );
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('discover.sportsTitle')}>
      {compact ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing[2], alignItems: 'center' }}
        >
          {chips}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>{chips}</View>
      )}
    </View>
  );
}
