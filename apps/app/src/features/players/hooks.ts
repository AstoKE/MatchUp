import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  blockUser,
  fetchMyBlocks,
  fetchPlayerCard,
  sendReport,
  unblockUser,
} from './api/players-api';

export function usePlayerCard(userId: string) {
  return useQuery({ queryKey: ['player', userId], queryFn: () => fetchPlayerCard(userId) });
}

export function useMyBlocks() {
  return useQuery({ queryKey: ['blocks'], queryFn: fetchMyBlocks });
}

/**
 * A block changes what every list and page may show, so everything is read again, except an open card: it would answer
 * NOT_FOUND and close before the screen could leave. It is only marked stale, for the next visit.
 */
function useBlockMutation(run: (userId: string) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => run(userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['player'], refetchType: 'none' });
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'player' });
    },
  });
}
export const useBlockUser = () => useBlockMutation(blockUser);
export const useUnblockUser = () => useBlockMutation(unblockUser);

export function useSendReport() {
  return useMutation({
    mutationFn: (args: Parameters<typeof sendReport>[0]) => sendReport(args),
  });
}
