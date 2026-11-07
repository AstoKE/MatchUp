import { useCallback } from 'react';
import { useMyProfile } from '@/features/profile';
import { sendUsageEvent, type UsageEvent } from './api/analytics-api';

/**
 * Records usage only for a signed-in person who turned the analytics consent on in Settings; for everyone else (guests
 * included) it does nothing and sends nothing. The server checks the consent again.
 */
export function useTrack(): (event: UsageEvent) => void {
  const profile = useMyProfile();
  const consented = profile.data?.settings.analyticsConsent === true;
  return useCallback(
    (event: UsageEvent) => {
      if (consented) sendUsageEvent(event);
    },
    [consented],
  );
}
