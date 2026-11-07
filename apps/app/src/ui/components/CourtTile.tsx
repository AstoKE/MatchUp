import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CourtDrawing } from '../graphics/CourtDrawing';
import { Icon } from '../graphics/Icon';
import { fontFamily, sportColors, TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * A sport to choose: its court on its own color, with its name. The name is the accessible label.
 * With `selected` it is one of a radio group (Discover's sport strip and filters); `compact` fits a scrolling line.
 */
export function CourtTile({
  slug,
  label,
  onPress,
  selected,
  compact = false,
  all = false,
}: {
  slug: string | undefined;
  label: string;
  onPress: () => void;
  selected?: boolean;
  compact?: boolean;
  /** "All sports": a few courts side by side instead of one drawing. */
  all?: boolean;
}) {
  const { breakpoint, colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const court = slug ? sportColors[slug] : undefined;
  const on = court?.on ?? colors.textPrimary;
  const radio = selected !== undefined;
  return (
    <Pressable
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityLabel={label}
      aria-checked={radio ? selected : undefined}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        // A compact tile is as tall as its content (it is far above the 44 pt minimum); the large one keeps its presence.
        minHeight: compact ? TOUCH_TARGET : TOUCH_TARGET * 2,
        borderRadius: radius.tile,
        backgroundColor: court?.court ?? colors.surfaceSunken,
        // The chosen tile is ringed in the text color; the others keep the same size with a clear ring.
        borderWidth: radio ? 3 : 0,
        borderColor: selected ? colors.textPrimary : 'transparent',
        opacity: pressed ? 0.85 : 1,
        ...(focused
          ? {
              outlineColor: colors.focusRing,
              outlineWidth: 2,
              outlineOffset: 2,
              outlineStyle: 'solid' as const,
            }
          : null),
      })}
    >
      <View
        style={{
          height: compact ? 40 : breakpoint === 'expanded' ? 104 : 64,
          padding: spacing[1],
          paddingBottom: 0,
        }}
      >
        {all ? <CourtMosaic /> : <CourtDrawing slug={slug} color={on} />}
      </View>
      <Text
        variant="label"
        style={{
          color: on,
          fontSize: compact ? 13 : 16,
          paddingHorizontal: compact ? spacing[2] : spacing[3],
          paddingTop: compact ? spacing[1] : 0,
          paddingBottom: spacing[2],
        }}
      >
        {label}
      </Text>
      {selected ? (
        // In the corner, so the check never pushes the name onto a second line.
        <View
          style={{
            position: 'absolute',
            top: spacing[1],
            right: spacing[1],
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.textPrimary,
          }}
        >
          <Icon name="check" color={colors.bgApp} size={14} />
        </View>
      ) : null}
    </Pressable>
  );
}

const MOSAIC = ['football', 'basketball', 'volleyball', 'tennis'] as const;

/** Four courts' colors side by side: every sport at once. */
function CourtMosaic() {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        // Lined up with the name, clear of the corner check.
        paddingLeft: spacing[1],
        gap: spacing[1],
      }}
    >
      {MOSAIC.map((slug) => (
        <View
          key={slug}
          style={{
            width: 12,
            height: 24,
            borderRadius: 4,
            backgroundColor: sportColors[slug]?.court,
          }}
        />
      ))}
    </View>
  );
}

/** When an event starts, on its sport's color: what stands at the head of a row. */
export function TimeTile({
  slug,
  time,
  size = 64,
}: {
  slug: string | undefined;
  time: string;
  size?: number;
}) {
  const { colors, radius, spacing } = useTheme();
  const court = slug ? sportColors[slug] : undefined;
  return (
    <View
      style={{
        alignSelf: 'center',
        minWidth: size,
        minHeight: size,
        paddingHorizontal: spacing[1],
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: court?.court ?? colors.surfaceSunken,
      }}
    >
      <Text
        style={{
          color: court?.on ?? colors.textPrimary,
          fontFamily: fontFamily.headingExtrabold,
          fontSize: size >= 80 ? 21 : 18,
          lineHeight: 24,
        }}
      >
        {time}
      </Text>
    </View>
  );
}
