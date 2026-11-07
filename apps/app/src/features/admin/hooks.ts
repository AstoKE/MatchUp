import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enrollTotp,
  fetchActions,
  fetchDisputes,
  fetchFlags,
  fetchAdminSecurity,
  fetchReport,
  fetchReports,
  fetchReviews,
  fetchUser,
  searchUsers,
  verifyTotp,
  fetchVenues,
  fetchPilotMetrics,
  type ReportCursor,
  type VenueCursor,
  type VenueStatus,
} from './api/admin-api';

export const useAdminSecurity = (enabled: boolean) =>
  useQuery({ queryKey: ['admin', 'security'], queryFn: fetchAdminSecurity, retry: false, enabled });

export function useEnrollTotp() {
  return useMutation({ mutationFn: enrollTotp });
}

export function useVerifyTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ factorId, code }: { factorId: string; code: string }) =>
      verifyTotp(factorId, code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useReports = (status: 'OPEN' | 'CLOSED') =>
  useInfiniteQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: ({ pageParam }) => fetchReports(status, pageParam),
    initialPageParam: null as ReportCursor | null,
    getNextPageParam: (last) => last.next_cursor,
  });

export const useReport = (id: string) =>
  useQuery({ queryKey: ['admin', 'report', id], queryFn: () => fetchReport(id) });

export const useFlags = () => useQuery({ queryKey: ['admin', 'flags'], queryFn: fetchFlags });
export const useDisputes = () =>
  useQuery({ queryKey: ['admin', 'disputes'], queryFn: fetchDisputes });
export const useUser = (id: string) =>
  useQuery({ queryKey: ['admin', 'user', id], queryFn: () => fetchUser(id) });
export const useFoundUsers = (query: string) =>
  useQuery({
    queryKey: ['admin', 'search', query],
    queryFn: () => searchUsers(query),
    enabled: query.trim().length >= 2,
  });
export const useReviewsOf = (userId: string, as: 'reviewer' | 'reviewee') =>
  useQuery({
    queryKey: ['admin', 'reviews', userId, as],
    queryFn: () => fetchReviews(userId, as),
  });

export const useActions = () =>
  useInfiniteQuery({
    queryKey: ['admin', 'actions'],
    queryFn: ({ pageParam }) => fetchActions(pageParam),
    initialPageParam: null as { id: number } | null,
    getNextPageParam: (last) => last.next_cursor,
  });

/** A decision changes what every list shows, so everything of the console is read again. */
export function useDecision<T>(run: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useAdminVenues = (status: VenueStatus) =>
  useInfiniteQuery({
    queryKey: ['admin', 'venues', status],
    queryFn: ({ pageParam }) => fetchVenues(status, pageParam),
    initialPageParam: null as VenueCursor | null,
    getNextPageParam: (last) => last.next_cursor,
  });

export const usePilotMetrics = (days: number) =>
  useQuery({ queryKey: ['admin', 'pilot', days], queryFn: () => fetchPilotMetrics(days) });
