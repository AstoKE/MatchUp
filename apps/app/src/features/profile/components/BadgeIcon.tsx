import { View } from 'react-native';
import { CourtDrawing, Icon, sportColors, useTheme, type IconName } from '@/ui';

const ICONS: Record<string, IconName> = {
  FIRST_MATCH: 'star',
  TEN_GAMES: 'trophy',
  MULTI_SPORT: 'compass',
  RELIABLE_PLAYER: 'check',
  COMMUNITY_ORGANIZER: 'person',
  FAIR_PLAY: 'heart',
};

/** A round badge (docs/design.md §11). Decorative: its name is written under it. A per-sport badge shows the sport. */
export function BadgeIcon({ code, sportSlug }: { code: string; sportSlug: string | undefined }) {
  const { colors, radius } = useTheme();
  const court = code === 'SPORT_REGULAR' && sportSlug ? sportColors[sportSlug] : undefined;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width: 64,
        height: 64,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: court?.court ?? colors.surfaceRaised,
        borderWidth: 2,
        borderColor: colors.actionPrimary,
      }}
    >
      {code === 'SPORT_REGULAR' ? (
        <View style={{ width: 42, height: 28 }}>
          <CourtDrawing slug={sportSlug} color={court?.on ?? colors.textPrimary} />
        </View>
      ) : (
        <Icon name={ICONS[code] ?? 'star'} color={colors.textPrimary} size={30} />
      )}
    </View>
  );
}
