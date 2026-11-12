import { lazy, Suspense } from 'react';

// Most organizers run no organization: the control loads with the management screen, not before it.
const EventOrganizationControl = lazy(() =>
  import('./EventOrganizationControl').then((m) => ({ default: m.EventOrganizationControl })),
);

export function LazyEventOrganizationControl(props: { eventId: string; currentId: string | null }) {
  return (
    <Suspense fallback={null}>
      <EventOrganizationControl {...props} />
    </Suspense>
  );
}
