import { RequireOnboarded } from '@/features/onboarding';
import { ProfileScreen } from '@/features/profile';

/** Profile — needs an account that has completed onboarding. */
export default function Profile() {
  return (
    <RequireOnboarded>
      <ProfileScreen />
    </RequireOnboarded>
  );
}
