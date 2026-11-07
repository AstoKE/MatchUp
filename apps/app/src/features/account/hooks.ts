import { brand } from '@matchup/config';
import { AppError } from '@matchup/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signInWithEmail, useSession } from '@/features/auth';
import { accountQueryKey } from '@/features/onboarding';
import { cancelAccountDeletion, exportMyData, requestAccountDeletion } from './api/account-api';
import { saveExport } from './save-export';

function useInvalidateAccount() {
  const queryClient = useQueryClient();
  const session = useSession();
  return async () => {
    if (session.status === 'authenticated') {
      await queryClient.invalidateQueries({ queryKey: accountQueryKey(session.userId) });
    }
  };
}

/**
 * Re-enters the password (a fresh sign-in is what the server checks, via the token's `amr`), then
 * requests deletion. Two calls on purpose: the password never reaches our own database code.
 */
export function useRequestDeletion(beforeRequest?: (userId: string) => Promise<void>) {
  const session = useSession();
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (input: { password: string; captchaToken?: string }) => {
      if (session.status !== 'authenticated' || !session.email) {
        throw new AppError('NOT_AUTHENTICATED');
      }
      await signInWithEmail({
        email: session.email,
        password: input.password,
        captchaToken: input.captchaToken,
      });
      // Phase 8 / M3: the profile photo's bytes go now; the purge cannot reach storage (ADR-0027). A failure here does not
      // stop the deletion request.
      if (beforeRequest) await beforeRequest(session.userId).catch(() => undefined);
      return requestAccountDeletion();
    },
    onSuccess: invalidate,
  });
}

export function useCancelDeletion() {
  const invalidate = useInvalidateAccount();
  return useMutation({ mutationFn: cancelAccountDeletion, onSuccess: invalidate });
}

export function exportFileName(now = new Date()): string {
  return `${brand.identifiers.slug}-data-${now.toISOString().slice(0, 10)}.json`;
}

export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const doc = await exportMyData();
      await saveExport(exportFileName(), JSON.stringify(doc, null, 2));
    },
  });
}
