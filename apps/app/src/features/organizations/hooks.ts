import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  cancelOrganizationRequest,
  fetchMyOrganizations,
  requestOrganization,
} from './api/organizations-api';

const mineKey = (userId: string | null) => ['organizations', 'mine', userId] as const;

export function useMyOrganizations() {
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.userId : null;
  return useQuery({
    queryKey: mineKey(userId),
    queryFn: fetchMyOrganizations,
    enabled: userId !== null,
  });
}

export function useRequestOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof requestOrganization>[0]) => requestOrganization(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

export function useCancelOrganizationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelOrganizationRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
