import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvatarKey, Gender, OnboardingInput } from '@matchup/domain';
import { useSession } from '@/features/auth';
import {
  acceptCurrentLegalTerms,
  completeOnboarding,
  fetchLegalVersions,
  fetchMyAccount,
  saveGenderAndAvatar,
} from './api/onboarding-api';

export const accountQueryKey = (userId: string) => ['account', userId] as const;

/** The signed-in user's server-side account state; idle for guests. */
export function useMyAccount() {
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.userId : null;
  return useQuery({
    queryKey: userId ? accountQueryKey(userId) : ['account', 'guest'],
    queryFn: fetchMyAccount,
    enabled: userId !== null,
    // Onboarding state flips once and then stays; avoid refetch storms on every focus.
    staleTime: 60_000,
  });
}

export function useLegalVersions() {
  return useQuery({
    queryKey: ['legal-versions'],
    queryFn: fetchLegalVersions,
    staleTime: 5 * 60_000,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async ({
      input,
      versions,
      avatar,
    }: {
      input: OnboardingInput;
      versions: { termsVersion: string; privacyVersion: string };
      /** Phase 8 / M3: saved before the account is re-read, so the avatar screen opens on it. */
      avatar?: { gender: Gender; key: AvatarKey };
    }) => {
      await completeOnboarding(input, versions);
      if (avatar) await saveGenderAndAvatar(avatar.gender, avatar.key).catch(() => undefined);
    },
    onSuccess: async () => {
      if (session.status === 'authenticated') {
        await queryClient.invalidateQueries({ queryKey: accountQueryKey(session.userId) });
      }
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      // The account may have been re-read (and the avatar screen opened) before the gender and drawing were saved.
      await queryClient.invalidateQueries({ queryKey: ['my-avatar'] });
    },
  });
}

export function useAcceptLegalTerms() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: acceptCurrentLegalTerms,
    onSuccess: async () => {
      if (session.status === 'authenticated') {
        await queryClient.invalidateQueries({ queryKey: accountQueryKey(session.userId) });
      }
    },
  });
}
