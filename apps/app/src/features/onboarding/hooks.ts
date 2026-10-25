import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OnboardingInput } from '@matchup/domain';
import { useSession } from '@/features/auth';
import {
  acceptCurrentLegalTerms,
  completeOnboarding,
  fetchLegalVersions,
  fetchMyAccount,
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
    mutationFn: ({
      input,
      versions,
    }: {
      input: OnboardingInput;
      versions: { termsVersion: string; privacyVersion: string };
    }) => completeOnboarding(input, versions),
    onSuccess: async () => {
      if (session.status === 'authenticated') {
        await queryClient.invalidateQueries({ queryKey: accountQueryKey(session.userId) });
      }
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
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
