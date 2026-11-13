import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  cancelBusinessRequest,
  fetchMyBusiness,
  fetchMyBusinesses,
  leaveBusiness,
  removeBusinessStaff,
  respondBusinessInvite,
  requestBusiness,
  searchClaimableVenues,
  updateBusinessVenue,
  updateMyBusiness,
} from './api/businesses-api';

export function useMyBusinesses() {
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.userId : null;
  return useQuery({
    queryKey: ['businesses', 'mine', userId],
    queryFn: fetchMyBusinesses,
    enabled: userId !== null,
  });
}

export function useRequestBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof requestBusiness>[0]) => requestBusiness(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['businesses'] }),
  });
}

export function useCancelBusinessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelBusinessRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['businesses'] }),
  });
}

export const useClaimableVenues = (cityId: string | null, q: string) =>
  useQuery({
    queryKey: ['businesses', 'venues', cityId, q],
    queryFn: () => searchClaimableVenues(cityId as string, q),
    enabled: cityId !== null && q.trim().length >= 2,
  });

export const useMyBusiness = (id: string) =>
  useQuery({ queryKey: ['businesses', 'owned', id], queryFn: () => fetchMyBusiness(id) });

export function useUpdateMyBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateMyBusiness>[0]) => updateMyBusiness(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['businesses'] }),
  });
}

export function useUpdateBusinessVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateBusinessVenue>[0]) => updateBusinessVenue(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['businesses'] }),
  });
}

export type StaffAction =
  { kind: 'respond'; accept: boolean } | { kind: 'leave' } | { kind: 'remove'; userId: string };

/** Accepting or declining an invitation, leaving, removing a staff member. */
export function useStaffAction(businessId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: StaffAction): Promise<void> =>
      action.kind === 'respond'
        ? respondBusinessInvite(businessId, action.accept)
        : action.kind === 'leave'
          ? leaveBusiness(businessId)
          : removeBusinessStaff(businessId, action.userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['businesses'] }),
  });
}
