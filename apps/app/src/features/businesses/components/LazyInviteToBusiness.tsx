import { lazy, Suspense } from 'react';

// Most player cards are seen by people who own no business: the invitation loads with the card, not before it.
const InviteToBusiness = lazy(() =>
  import('./InviteToBusiness').then((m) => ({ default: m.InviteToBusiness })),
);

export function LazyInviteToBusiness(props: { userId: string; name: string }) {
  return (
    <Suspense fallback={null}>
      <InviteToBusiness {...props} />
    </Suspense>
  );
}
