import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CourtDrawing } from '../graphics/CourtDrawing';
import { fontFamily, sportColors, TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

/** A sport to choose: its court on its own color, with its name. The name is the accessible label. */
export function CourtTile({
  slug,
  label,
  onPress,
}: {
  slug: string;
  label: string;
  onPress: () => void;
}) {
  const { breakpoint, colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const court = sportColors[slug];
  const on = court?.on ?? colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: TOUCH_TARGET * 2,
        borderRadius: radius.tile,
        backgroundColor: court?.court ?? colors.surfaceSunken,
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
          height: breakpoint === 'expanded' ? 104 : 64,
          padding: spacing[1],
          paddingBottom: 0,
        }}
      >
        <CourtDrawing slug={slug} color={on} />
      </View>
      <Text
        variant="label"
        style={{
          color: on,
          fontSize: 16,
          paddingHorizontal: spacing[3],
          paddingBottom: spacing[2],
        }}
      >
        {label}
      </Text>
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
