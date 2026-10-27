import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
