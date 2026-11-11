import { RequireOnboarded } from '@/features/onboarding';
import { LazyOrganizationScreen } from '@/features/organizations';

export default function OrganizationPage() {
  return (
    <RequireOnboarded>
      <LazyOrganizationScreen />
    </RequireOnboarded>
  );
}
