import type { MyEventBucket, SearchPayload } from '@matchup/domain';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyEvents } from './api/my-events-api';
import {
  cancelParticipation,
  decideParticipation,
  fetchEventRequests,
  fetchMyParticipation,
  requestJoin,
} from './api/participation-api';
import { searchEvents, type SearchCursor } from './api/search-api';
import {
  cancelEvent,
  completeEvent,
  createEvent,
  deleteDraft,
  fetchEvent,
  publishEvent,
  updateEvent,
} from './api/events-api';

export const eventQueryKey = (id: string) => ['event', id] as const;

export function useEvent(id: string) {
  return useQuery({ queryKey: eventQueryKey(id), queryFn: () => fetchEvent(id) });
}

/** Discover list under the ['events'] prefix, so every organizer action refreshes it too. */
export function useEventSearch(payload: SearchPayload) {
  return useInfiniteQuery({
    queryKey: ['events', 'search', payload],
    queryFn: ({ pageParam }) => searchEvents(payload, pageParam),
    initialPageParam: null as SearchCursor | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** One My Events tab; also under ['events'], so publishing or canceling refreshes it. */
export function useMyEvents(bucket: MyEventBucket, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['events', 'mine', bucket],
    queryFn: ({ pageParam }) => fetchMyEvents(bucket, pageParam),
    initialPageParam: null as SearchCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/** Every organizer action changes the event: refetch it (and later lists) afterwards. */
function useEventMutation<TArgs>(
  run: (args: TArgs) => Promise<unknown>,
  idOf: (args: TArgs) => string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (_data, args) => {
      await queryClient.invalidateQueries({ queryKey: eventQueryKey(idOf(args)) });
      await queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });
}

export const useUpdateEvent = () => useEventMutation(updateEvent, (a) => a.id);
export const usePublishEvent = () => useEventMutation(publishEvent, (id) => id);
export const useCancelEvent = () => useEventMutation(cancelEvent, (a) => a.id);
export const useCompleteEvent = () => useEventMutation(completeEvent, (id) => id);
export const useDeleteDraft = () => useEventMutation(deleteDraft, (id) => id);

const participationKey = (eventId: string) => ['participation', eventId] as const;
const requestsKey = (eventId: string) => ['requests', eventId] as const;

/** The viewer's own request on an event (null for guests and people who never asked). */
export function useMyParticipation(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: participationKey(eventId),
    queryFn: () => fetchMyParticipation(eventId),
    enabled,
  });
}

/** Everything a join, a withdrawal or an organizer decision can change: the event, lists, requests, inbox. */
function useParticipationMutation<TArgs, TData>(
  run: (args: TArgs) => Promise<TData>,
  eventIdOf: (args: TArgs) => string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (_data, args) => {
      const eventId = eventIdOf(args);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: participationKey(eventId) }),
        queryClient.invalidateQueries({ queryKey: requestsKey(eventId) }),
        queryClient.invalidateQueries({ queryKey: eventQueryKey(eventId) }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
    },
  });
}

// Wrapped so the mutation context react-query adds as a second argument never reaches the API layer.
export const useRequestJoin = () =>
  useParticipationMutation(
    (args: Parameters<typeof requestJoin>[0]) => requestJoin(args),
    (a) => a.eventId,
  );
export const useCancelParticipation = () =>
  useParticipationMutation(
    (eventId: string) => cancelParticipation(eventId),
    (eventId) => eventId,
  );

/** Organizer decisions carry the event id so the right queue refreshes. */
export function useDecideParticipation(eventId: string) {
  return useParticipationMutation(
    (args: {
      participationId: string;
      decision: Parameters<typeof decideParticipation>[0]['decision'];
    }) => decideParticipation(args),
    () => eventId,
  );
}

/** Organizer only; the server answers NOT_FOUND to anybody else. */
export function useEventRequests(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: requestsKey(eventId),
    queryFn: () => fetchEventRequests(eventId),
    enabled,
  });
}
