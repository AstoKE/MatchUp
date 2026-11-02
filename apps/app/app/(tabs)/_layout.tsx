import { Tabs, usePathname } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { navItems } from '@/navigation/config';
import { tabAccessibilityLabel } from '@/navigation/tab-label';
import { Dock, DockSpaceProvider, useTheme, useVisibleDockSpace } from '@/ui';

/**
 * Primary navigation: the floating dock on every screen size. On a phone it steps aside on the event page and
 * the join form, whose pinned action is the one thing to do there (docs/design.md §5.2).
 * Items come from navigation/config.ts (data-driven; Community can be added later).
 */
export default function TabsLayout() {
  const { t } = useTranslation('nav');
  const { breakpoint } = useTheme();
  const pathname = usePathname();
  const space = useVisibleDockSpace();
  const hidden = breakpoint === 'compact' && /^\/e\/[^/]+(\/join)?$/.test(pathname);

  return (
    <DockSpaceProvider value={hidden ? 0 : space}>
      <Tabs
        // Opening an event from a tab and going back returns to where the user came from.
        backBehavior="history"
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigateToTab }) => {
          if (hidden) return null;
          const current = state.routes[state.index]?.name;
          return (
            <Dock
              items={navItems.map((item, position) => ({
                key: item.name,
                label: t(item.labelKey),
                accessibilityLabel: tabAccessibilityLabel(
                  t,
                  t(item.labelKey),
                  position + 1,
                  navItems.length,
                  Platform.OS,
                ),
                icon: item.icon,
                emphasized: item.emphasized,
                selected: current === item.name,
                onPress: () => {
                  const route = state.routes.find((r) => r.name === item.name);
                  if (route && current !== item.name) navigateToTab(route.key);
                },
              }))}
            />
          );
        }}
      >
        {navItems.map((item) => (
          <Tabs.Screen key={item.name} name={item.name} options={{ title: t(item.labelKey) }} />
        ))}
        {/* Event routes and the inbox live in this group so the dock stays visible; they are not destinations of
            their own. The dock only draws navItems. `href: null` is not an option: navigating to a hidden tab
            redirects away (expo-router 58). */}
        {(
          [
            'e/[id]/index',
            'e/[id]/edit',
            'e/[id]/cancel',
            'e/[id]/join',
            'e/[id]/manage',
            'e/[id]/requested',
            'u/[id]',
            'notifications',
          ] as const
        ).map((name) => (
          <Tabs.Screen key={name} name={name} />
        ))}
      </Tabs>
    </DockSpaceProvider>
  );
}
