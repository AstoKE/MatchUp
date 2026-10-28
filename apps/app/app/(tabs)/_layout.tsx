import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { navItems } from '@/navigation/config';
import { Icon, useTheme } from '@/ui';

/** Fixed-width rail (React Navigation otherwise sizes the left bar to its container). */
const railSize = (width: number) => ({
  width,
  minWidth: width,
  maxWidth: width,
  flexGrow: 0,
  flexShrink: 0,
  flexBasis: width,
});

/**
 * Primary navigation. Compact screens: bottom tab bar. Medium/expanded: a left rail (UI_DESIGN_SYSTEM §6).
 * Items come from navigation/config.ts (data-driven; Community can be added later).
 */
export default function TabsLayout() {
  const { t } = useTranslation('nav');
  const { colors, breakpoint, spacing } = useTheme();
  // Android edge-to-edge: the explicit bar height below must include the system gesture/nav bar inset,
  // or the labels collide with it (found on the emulator, docs/native-validation/).
  const insets = useSafeAreaInsets();
  const wide = breakpoint !== 'compact';

  return (
    <Tabs
      // Opening an event from a tab and going back returns to where the user came from.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelPosition: wide ? 'beside-icon' : undefined,
        tabBarStyle: {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.borderSubtle,
          ...(breakpoint === 'compact'
            ? {
                height: 68 + insets.bottom,
                paddingTop: spacing[1],
                paddingBottom: spacing[2] + insets.bottom,
              }
            : { ...railSize(breakpoint === 'medium' ? 184 : 248), paddingTop: spacing[4] }),
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarActiveBackgroundColor: colors.surfaceSunken,
        tabBarInactiveBackgroundColor: 'transparent',
      }}
    >
      {navItems.map((item) => (
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{
            title: t(item.labelKey),
            tabBarIcon: ({ color, size, focused }) => (
              <Icon
                name={item.icon}
                variant={focused || item.emphasized ? 'filled' : 'outline'}
                size={item.emphasized ? size + 6 : size}
                color={
                  item.emphasized
                    ? colors.actionPrimary
                    : typeof color === 'string'
                      ? color
                      : colors.textSecondary
                }
              />
            ),
          }}
        />
      ))}
      {/* Event routes (/e/<id>, edit, cancel) live in this group so the navigation stays visible, but
          they are not destinations of their own: no bar/rail button. `href: null` is not an option,
          it marks the tab hidden and navigating to a hidden tab redirects away (expo-router 58). */}
      {(['e/[id]/index', 'e/[id]/edit', 'e/[id]/cancel'] as const).map((name) => (
        <Tabs.Screen key={name} name={name} options={{ tabBarButton: () => null }} />
      ))}
    </Tabs>
  );
}
