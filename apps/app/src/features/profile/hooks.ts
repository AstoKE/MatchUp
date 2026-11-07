import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  fetchMyProfile,
  replaceSportProfiles,
  setAnalyticsConsent,
  setMarketingConsent,
  updateMyProfile,
  updateMySettings,
} from './api/profile-api';
import { fetchMyProgress } from './api/progress-api';

const profileKey = (userId: string) => ['profile', userId] as const;

/** The signed-in user's profile + settings + sports; idle for guests. */
export function useMyProfile() {
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.userId : null;
  return useQuery({
    queryKey: userId ? profileKey(userId) : ['profile', 'guest'],
    queryFn: () => fetchMyProfile(userId as string),
    enabled: userId !== null,
  });
}

/** Skill, reliability, XP and badges; server-side jobs change them, so this refetches on each visit. */
export function useMyProgress() {
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.userId : null;
  return useQuery({
    queryKey: ['progress', userId],
    queryFn: () => fetchMyProgress(userId as string),
    enabled: userId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Wraps a write so the profile is re-read afterwards (the server stays the source of truth). */
function useProfileMutation<TInput>(mutationFn: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export const useUpdateProfile = () => useProfileMutation(updateMyProfile);
export const useUpdateSettings = () => useProfileMutation(updateMySettings);
export const useSetMarketingConsent = () => useProfileMutation(setMarketingConsent);
export const useSetAnalyticsConsent = () => useProfileMutation(setAnalyticsConsent);
export const useReplaceSports = () => useProfileMutation(replaceSportProfiles);
