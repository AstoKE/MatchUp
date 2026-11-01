import { View } from 'react-native';
import { Icon, SportIcon, useTheme, type IconName } from '@/ui';

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
        backgroundColor: colors.surfaceRaised,
        borderWidth: 2,
        borderColor: colors.actionPrimary,
      }}
    >
      {code === 'SPORT_REGULAR' ? (
        <SportIcon slug={sportSlug} color={colors.textPrimary} size={32} />
      ) : (
        <Icon name={ICONS[code] ?? 'star'} color={colors.textPrimary} size={30} />
      )}
    </View>
  );
}
