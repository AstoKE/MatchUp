import { LazyMyBusinessesScreen } from '@/features/businesses';
import { RequireOnboarded } from '@/features/onboarding';

export default function MyBusinesses() {
  return (
    <RequireOnboarded>
      <LazyMyBusinessesScreen />
    </RequireOnboarded>
  );
}
