import { RequireOnboarded } from '@/features/onboarding';
import { EditProfileScreen } from '@/features/profile';

export default function EditProfile() {
  return (
    <RequireOnboarded>
      <EditProfileScreen />
    </RequireOnboarded>
  );
}
