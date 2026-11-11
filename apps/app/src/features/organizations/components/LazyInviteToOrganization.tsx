import { lazy, Suspense } from 'react';

// Most player cards are seen by people who run no organization: the invitation loads with the card, not before it.
const InviteToOrganization = lazy(() =>
  import('./InviteToOrganization').then((m) => ({ default: m.InviteToOrganization })),
);

export function LazyInviteToOrganization(props: { userId: string; name: string }) {
  return (
    <Suspense fallback={null}>
      <InviteToOrganization {...props} />
    </Suspense>
  );
}
