import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { navItems } from '@/navigation/config';
import { useTheme } from '@/ui';

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
  const wide = breakpoint !== 'compact';

  return (
    <Tabs
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
            ? { height: 68, paddingTop: spacing[1], paddingBottom: spacing[2] }
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
              <Ionicons
                name={focused ? item.iconFocused : item.icon}
                size={item.emphasized ? size + 6 : size}
                color={
                  item.emphasized
                    ? colors.actionPrimary
                    : typeof color === 'string'
                      ? color
                      : colors.textSecondary
                }
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
