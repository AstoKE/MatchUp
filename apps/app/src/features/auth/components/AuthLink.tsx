import { Link, type Href } from 'expo-router';
import { Text } from '@/ui';

/** A real link (anchor on web) with a comfortable touch target, for moving between account screens. */
export function AuthLink({ href, label }: { href: Href; label: string }) {
  return (
    <Link href={href} style={{ paddingVertical: 12, minHeight: 48 }}>
      <Text variant="label" tone="link">
        {label}
      </Text>
    </Link>
  );
}
