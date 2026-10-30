import type { TFunction } from 'i18next';

/**
 * iOS only. React Navigation's default label is "<title>, tab, <n> of <all routes>", and the routes hidden
 * with `tabBarButton: () => null` (event pages, inbox) are counted: VoiceOver said "1 of 8" with four tabs on
 * screen. Android has no such default, so it keeps the plain label (undefined = library default).
 */
export function tabAccessibilityLabel(
  t: TFunction<'nav'>,
  label: string,
  position: number,
  count: number,
  os: string,
): string | undefined {
  if (os !== 'ios') return undefined;
  return t('tabPosition', { label, index: position, count });
}
