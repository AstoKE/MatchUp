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
}: {
  slug: string | undefined;
  label: string;
  onPress: () => void;
  selected?: boolean;
  compact?: boolean;
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
        minHeight: TOUCH_TARGET * 2,
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
          height: compact ? 44 : breakpoint === 'expanded' ? 104 : 64,
          padding: spacing[1],
          paddingBottom: 0,
        }}
      >
        <CourtDrawing slug={slug} color={on} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[1],
          paddingHorizontal: compact ? spacing[2] : spacing[3],
          paddingBottom: spacing[2],
        }}
      >
        {selected ? <Icon name="check" color={on} size={16} /> : null}
        <Text variant="label" style={{ color: on, fontSize: compact ? 14 : 16, flexShrink: 1 }}>
          {label}
        </Text>
      </View>
    </Pressable>
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
