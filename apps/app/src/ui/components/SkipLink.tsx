import { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme';
import { Text } from './Text';

/** Web-only "skip to content" (WCAG 2.4.1): first tab stop, visible on focus, jumps to the visible main landmark. */
export function SkipLink() {
  const { colors, spacing, radius } = useTheme();
  const { t } = useTranslation('common');
  const [focused, setFocused] = useState(false);
  if (Platform.OS !== 'web') return null;

  const jump = () => {
    const mains = Array.from(document.querySelectorAll<HTMLElement>('[role="main"]'));
    const visible = mains.find((el) => el.offsetParent !== null) ?? mains[0];
    visible?.focus();
    visible?.scrollIntoView?.();
  };

  return (
    <Pressable
      role="link"
      accessibilityLabel={t('skipToContent')}
      onPress={jump}
      // react-native-web only activates role="button" on Enter/Space; a link must also react to Enter.
      onKeyDown={(event) => {
        if (event.nativeEvent.key === 'Enter') jump();
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: 'absolute',
        top: focused ? spacing[2] : -200,
        left: spacing[2],
        zIndex: 1000,
        padding: spacing[3],
        borderRadius: radius.md,
        backgroundColor: colors.actionPrimary,
      }}
    >
      <Text variant="label" tone="onAction">
        {t('skipToContent')}
      </Text>
    </Pressable>
  );
}
