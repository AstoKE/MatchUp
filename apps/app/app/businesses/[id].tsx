import { LazyBusinessEditScreen } from '@/features/businesses';
import { RequireOnboarded } from '@/features/onboarding';

export default function EditBusiness() {
  return (
    <RequireOnboarded>
      <LazyBusinessEditScreen />
    </RequireOnboarded>
  );
}
