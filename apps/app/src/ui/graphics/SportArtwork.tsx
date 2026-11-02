import { View } from 'react-native';
import { useTheme } from '../theme';
import { sportColors } from '../tokens';
import { CourtDrawing } from './CourtDrawing';

/**
 * The sport's court on its own color (docs/design.md §7): what stands where other apps show a photo.
 * Decorative: the sport's name is always in the text beside it.
 */
export function SportArtwork({
  slug,
  size,
  width,
  height,
  square = false,
}: {
  slug: string | undefined;
  /** A square thumbnail. */
  size?: number;
  /** Or free dimensions; a number or a share of the parent. */
  width?: number | `${number}%`;
  height?: number;
  /** No rounded corners (edge to edge). */
  square?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const court = slug ? sportColors[slug] : undefined;
  return (
    <View
      style={{
        width: size ?? width ?? '100%',
        height: size ?? height ?? 60,
        padding: spacing[1],
        borderRadius: square ? 0 : radius.md,
        overflow: 'hidden',
        backgroundColor: court?.court ?? colors.surfaceSunken,
      }}
    >
      <CourtDrawing slug={slug} color={court?.on ?? colors.textSecondary} />
    </View>
  );
}
