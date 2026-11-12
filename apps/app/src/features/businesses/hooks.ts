import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  cancelBusinessRequest,
  fetchMyBusinesses,
  requestBusiness,
  searchClaimableVenues,
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
