import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, type CatalogSport } from '@/features/catalog';
import { currentLocale } from '@/lib/i18n';
import { Button, CourtTile, Text, useTheme } from '@/ui';
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
  const { spacing, breakpoint } = useTheme();
  const locale = currentLocale();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text tone="secondary">{t('discover.pickerHint')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {sports.map((sport) => (
          // Two or five to a row: ten sports leave no row half empty.
          <View
            key={sport.id}
            style={{ flexGrow: 1, flexBasis: breakpoint === 'compact' ? '48%' : '18%' }}
          >
            <CourtTile
              label={localizedName(sport.names, locale)}
              slug={sport.slug}
              onPress={() => onChoose(sport.id)}
            />
          </View>
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

/** The way to another sport once one is chosen, always above the list: a line of small courts. */
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
  const options = sportOptions(sports, t('discover.allSports'), locale);
  const tiles = options.map((option) => (
    <View
      key={option.id}
      style={{ width: 116 }}
      // A remembered sport can be far along the line, out of view.
      onLayout={
        compact && option.id === choice
          ? (e) =>
              scroller.current?.scrollTo({
                x: Math.max(0, e.nativeEvent.layout.x - spacing[4]),
                animated: false,
              })
          : undefined
      }
    >
      <CourtTile
        compact
        slug={option.slug}
        all={option.id === ALL_SPORTS}
        label={option.label}
        selected={option.id === choice}
        onPress={() => onChoose(option.id)}
      />
    </View>
  ));
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('discover.sportsTitle')}>
      {/* One scrolling line on a phone; a mouse cannot scroll a line whose bar is hidden, so wider screens wrap. */}
      {compact ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing[2], paddingVertical: spacing[1] }}
        >
          {tiles}
        </ScrollView>
      ) : (
        <TileGrid>
          {options.map((option) => (
            <CourtTile
              key={option.id}
              compact
              slug={option.slug}
              all={option.id === ALL_SPORTS}
              label={option.label}
              selected={option.id === choice}
              onPress={() => onChoose(option.id)}
            />
          ))}
        </TileGrid>
      )}
    </View>
  );
}

/**
 * Equal columns that fit the measured width (tiles at least MIN_TILE wide), so a short last row keeps
 * the tile size instead of stretching: one row of all sports on a desktop, three columns in the phone's sheet.
 */
const MIN_TILE = 100;
function TileGrid({ children }: { children: ReactNode[] }) {
  const { spacing } = useTheme();
  const [width, setWidth] = useState(0);
  const gap = spacing[2];
  const columns = Math.max(
    1,
    Math.min(children.length, Math.floor((width + gap) / (MIN_TILE + gap))),
  );
  const tile = width > 0 ? (width - gap * (columns - 1)) / columns : MIN_TILE;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
    >
      {children.map((child, i) => (
        <View key={i} style={{ width: tile }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** The same choice as the strip, as a grid inside the Filters sheet. */
export function SportGrid({
  sports,
  choice,
  onChoose,
}: {
  sports: readonly CatalogSport[];
  choice: string;
  onChoose: (choice: string) => void;
}) {
  const { t } = useTranslation('events');
  const { spacing } = useTheme();
  const locale = currentLocale();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text variant="label" tone="secondary">
        {t('discover.sportsTitle')}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('discover.sportsTitle')}>
        <TileGrid>
          {sportOptions(sports, t('discover.allSports'), locale).map((option) => (
            <CourtTile
              key={option.id}
              compact
              slug={option.slug}
              all={option.id === ALL_SPORTS}
              label={option.label}
              selected={option.id === choice}
              onPress={() => onChoose(option.id)}
            />
          ))}
        </TileGrid>
      </View>
    </View>
  );
}

function sportOptions(
  sports: readonly CatalogSport[],
  allLabel: string,
  locale: ReturnType<typeof currentLocale>,
): { id: string; label: string; slug: string | undefined }[] {
  return [
    { id: ALL_SPORTS, label: allLabel, slug: undefined },
    ...sports.map((sport) => ({
      id: sport.id,
      label: localizedName(sport.names, locale),
      slug: sport.slug,
    })),
  ];
}
