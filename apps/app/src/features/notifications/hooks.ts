import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationsRead,
} from './api/notifications-api';

/** ADR-0019: notifications are polled, not pushed (on focus and every 60 s while visible). */
const POLL_MS = 60_000;

export function useUnreadCount() {
  const session = useSession();
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: fetchUnreadCount,
    enabled: session.status === 'authenticated',
    refetchInterval: POLL_MS,
  });
}

export function useNotifications() {
  const session = useSession();
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: fetchNotifications,
    enabled: session.status === 'authenticated',
    refetchInterval: POLL_MS,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
