import { RequireOnboarded } from '@/features/onboarding';
import { EditSportsScreen } from '@/features/profile';

export default function EditSports() {
  return (
    <RequireOnboarded>
      <EditSportsScreen />
    </RequireOnboarded>
  );
}
