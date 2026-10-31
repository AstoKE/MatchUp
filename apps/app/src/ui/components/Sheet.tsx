import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion, useTheme } from '../theme';
import { Text } from './Text';

/**
 * A modal panel: from the bottom on a phone, centered on wider screens. Modal keeps focus inside on web and handles
 * Escape and Android back through onClose. The caller provides the localized close action in `footer`.
 */
export function Sheet({
  visible,
  title,
  onClose,
  closeLabel,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Accessible name of the backdrop, which also closes. */
  closeLabel: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { colors, radius, spacing, breakpoint } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const compact = breakpoint === 'compact';
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: compact ? 'flex-end' : 'center',
          alignItems: compact ? 'stretch' : 'center',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: colors.overlay,
          }}
        />
        <View
          role="dialog"
          aria-modal
          aria-label={title}
          accessibilityViewIsModal
          style={{
            maxHeight: '85%',
            width: compact ? undefined : 480,
            gap: spacing[4],
            padding: spacing[4],
            paddingBottom: compact ? spacing[4] + insets.bottom : spacing[4],
            backgroundColor: colors.surfaceOverlay,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderBottomLeftRadius: compact ? 0 : radius.xl,
            borderBottomRightRadius: compact ? 0 : radius.xl,
          }}
        >
          <Text variant="title" heading={2}>
            {title}
          </Text>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}
