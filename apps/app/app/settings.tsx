import { RequireOnboarded } from '@/features/onboarding';
import { SettingsScreen } from '@/features/profile';

export default function Settings() {
  return (
    <RequireOnboarded>
      <SettingsScreen />
    </RequireOnboarded>
  );
}
