import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useDockSpace } from './Dock';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Constrain and center content on wide layouts (UI_DESIGN_SYSTEM §6). */
  maxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned below the scrolling content (the page's one dominant action on a phone, design.md §8). */
  footer?: ReactNode;
  testID?: string;
}

/**
 * Page container: background, safe-area padding, responsive gutters, and the web `main` landmark
 * (axe `region` rule, WCAG 1.3.1/2.4.1).
 */
export function Screen({
  children,
  scroll = true,
  maxWidth = 960,
  contentStyle,
  footer,
  testID,
}: ScreenProps) {
  const { colors, spacing, breakpoint } = useTheme();
  const insets = useSafeAreaInsets();
  const dockSpace = useDockSpace();
  const gutter =
    breakpoint === 'expanded' ? spacing[8] : breakpoint === 'medium' ? spacing[6] : spacing[4];

  const inner = (
    <View
      style={[
        {
          width: '100%',
          maxWidth,
          alignSelf: 'center',
          paddingHorizontal: gutter,
          paddingTop: spacing[4],
          paddingBottom: spacing[8] + (footer ? 0 : dockSpace),
          gap: spacing[4],
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <View
      role="main"
      tabIndex={-1}
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: colors.bgApp,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {/*
        With a pinned footer the on-screen keyboard must lift it. Since Android 15 apps draw edge to edge and the
        window is no longer resized for the keyboard, so the pinned form ended up UNDER it (found on the
        emulator, docs/NATIVE_VALIDATION.md): the padding is applied by hand. Screens without a footer keep
        the behaviour that was validated, and on web there is no keyboard event, so nothing changes there.
      */}
      <KeyboardAvoidingView enabled={Boolean(footer)} behavior="padding" style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1 }}
            style={{ flex: 1 }}
          >
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
        {footer ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.borderSubtle,
              backgroundColor: colors.surfaceRaised,
              paddingHorizontal: gutter,
              paddingTop: spacing[3],
              paddingBottom: spacing[3] + Math.max(dockSpace, insets.bottom),
              alignItems: 'center',
            }}
          >
            <View style={{ width: '100%', maxWidth }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
