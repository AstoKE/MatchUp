import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Text } from 'react-native';

/**
 * expo-router's <Link> for tests that mock expo-router: pressing it calls the mocked router's push with the link's
 * href, so a test can assert navigation the same way for links and buttons. With `asChild` the child receives the press.
 */
export function LinkMock({
  href,
  asChild,
  children,
}: {
  href: unknown;
  asChild?: boolean;
  children: ReactNode;
}) {
  const router = (
    jest.requireMock('expo-router') as { useRouter: () => { push: (h: unknown) => void } }
  ).useRouter();
  const onPress = () => router.push(href);
  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ onPress?: () => void }>, { onPress });
  }
  return <Text onPress={onPress}>{children}</Text>;
}
