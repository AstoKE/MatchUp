import { LazyBusinessRequestScreen } from '@/features/businesses';
import { RequireOnboarded } from '@/features/onboarding';

export default function NewBusiness() {
  return (
    <RequireOnboarded>
      <LazyBusinessRequestScreen />
    </RequireOnboarded>
  );
}
