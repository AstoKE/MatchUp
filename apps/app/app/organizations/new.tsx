import { RequireOnboarded } from '@/features/onboarding';
import { LazyOrganizationRequestScreen } from '@/features/organizations';

export default function NewOrganization() {
  return (
    <RequireOnboarded>
      <LazyOrganizationRequestScreen />
    </RequireOnboarded>
  );
}
