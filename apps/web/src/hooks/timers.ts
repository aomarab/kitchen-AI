import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CookingTimer, CreateTimerRequest, UpdateTimerRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

const TIMERS_KEY = ['timers'] as const;

/**
 * Timers are polled rather than counted down from a single fetch.
 *
 * The countdown itself is local (see `useTimerTick`), derived from each timer's
 * `endsAt`, so the display is smooth without any network chatter. The poll is
 * only there to notice work done on another surface — the kiosk and a phone are
 * expected to be looking at the same timers at the same time.
 */
export function useTimers() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: TIMERS_KEY,
    queryFn: () => api.call('listTimers'),
    enabled: ready,
    refetchInterval: 30_000,
  });
}

export function useCreateTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTimerRequest) => api.call('createTimer', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMERS_KEY }),
  });
}

export function useUpdateTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTimerRequest }) =>
      api.call('updateTimer', { params: { id }, body }),
    // The server owns the state machine — it can legally answer with a status
    // the client did not ask for (extending a finished timer restarts it), so
    // the response replaces the cached row rather than a guess made up front.
    onSuccess: (timer: CookingTimer) => {
      qc.setQueryData<{ items: CookingTimer[] }>(TIMERS_KEY, (previous) =>
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
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMERS_KEY }),
  });
}
