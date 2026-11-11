import { RequireOnboarded } from '@/features/onboarding';
import { LazyMyOrganizationsScreen } from '@/features/organizations';

export default function MyOrganizations() {
  return (
    <RequireOnboarded>
      <LazyMyOrganizationsScreen />
    </RequireOnboarded>
  );
}
