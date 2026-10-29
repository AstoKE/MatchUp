import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

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
          paddingBottom: spacing[8],
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
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
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
            paddingVertical: spacing[3],
            alignItems: 'center',
          }}
        >
          <View style={{ width: '100%', maxWidth }}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}
