import { useState } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { Icon } from '../graphics/Icon';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * A round picture of a person: a drawing or a photo when given, the initials otherwise (and when the picture fails to
 * load). Decorative: the name is always written beside it, or given by the control around it. Turkish case rules apply
 * whatever the app language, because the names are Turkish (i → İ).
 */
export function Avatar({
  name,
  size = 64,
  image,
  fallback = 'initials',
}: {
  name: string;
  size?: number;
  image?: ImageSourcePropType | null;
  /**
   * Without a picture: the initials, or a person icon where the avatar sits inside a named control (the control's name
   * must contain any visible text, WCAG 2.5.3).
   */
  fallback?: 'initials' | 'icon';
}) {
  const { colors, radius } = useTheme();
  const [failed, setFailed] = useState<ImageSourcePropType | null>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr'))
    .join('');
  const showImage = image !== null && image !== undefined && failed !== image;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: showImage ? colors.surfaceSunken : colors.selected,
      }}
    >
      {showImage ? (
        <Image
          source={image}
          onError={() => setFailed(image)}
          resizeMode="cover"
          style={{ width: size, height: size }}
        />
      ) : fallback === 'icon' ? (
        <Icon name="person" color={colors.onSelected} size={Math.round(size * 0.55)} />
      ) : (
        <Text
          variant={size >= 48 ? 'title' : 'label'}
          style={{ color: colors.onSelected, fontSize: Math.max(12, Math.round(size * 0.36)) }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}
