import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  cancelOrganizationRequest,
  decideJoinRequest,
  fetchMyOrganizations,
  fetchOrganization,
  leaveOrganization,
  removeMember,
  requestOrganization,
  requestToJoin,
  respondToInvite,
  setMemberRole,
  transferOwnership,
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

export const useOrganization = (id: string) =>
  useQuery({ queryKey: ['organizations', 'page', id], queryFn: () => fetchOrganization(id) });

export type MembershipAction =
  | { kind: 'join' }
  | { kind: 'respond'; accept: boolean }
  | { kind: 'decide'; userId: string; accept: boolean }
  | { kind: 'leave' }
  | { kind: 'remove'; userId: string }
  | { kind: 'role'; userId: string; role: 'ADMIN' | 'MEMBER' }
  | { kind: 'transfer'; userId: string };

/** Every change on the organization page; the server checks who may do what. */
export function useMembershipAction(org: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: MembershipAction): Promise<void> => {
      switch (action.kind) {
        case 'join':
          await requestToJoin(org);
          return;
        case 'respond':
          return respondToInvite(org, action.accept);
        case 'decide':
          return decideJoinRequest(org, action.userId, action.accept);
        case 'leave':
          return leaveOrganization(org);
        case 'remove':
          return removeMember(org, action.userId);
        case 'role':
          return setMemberRole(org, action.userId, action.role);
        case 'transfer':
          return transferOwnership(org, action.userId);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
