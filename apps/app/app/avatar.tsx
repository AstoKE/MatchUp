import { RequireOnboarded } from '@/features/onboarding';
import { LazyAvatarScreen } from '@/features/profile';

export default function Avatar() {
  return (
    <RequireOnboarded>
      <LazyAvatarScreen />
    </RequireOnboarded>
  );
}
