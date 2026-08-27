import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CookingTimer, CreateTimerRequest, UpdateTimerRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { qk } from './keys';

/**
 * Timers are polled, not counted down from a single fetch.
 *
 * The countdown is local — derived from each timer's `endsAt` by the screen's
 * own tick — so the display is smooth without network chatter. The poll only
 * exists to notice work done on another surface: the kiosk and a phone are
 * expected to be looking at the same pot at the same time.
 */
export function useTimers() {
  return useQuery({
    queryKey: qk.timers,
    queryFn: () => api.call('listTimers'),
    refetchInterval: 30_000,
  });
}

export function useCreateTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTimerRequest) => api.call('createTimer', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.timers }),
  });
}

export function useUpdateTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTimerRequest }) =>
      api.call('updateTimer', { params: { id }, body }),
    // The server owns the state machine and can legally answer with a status the
    // client never asked for (extending a finished timer restarts it), so the
    // response replaces the cached row instead of a guess made up front.
    onSuccess: (timer: CookingTimer) => {
      qc.setQueryData<{ items: CookingTimer[] }>(qk.timers, (previous) =>
        previous
          ? { items: previous.items.map((t) => (t.id === timer.id ? timer : t)) }
          : { items: [timer] },
      );
    },
  });
}

export function useDeleteTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('deleteTimer', { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.timers }),
  });
}
