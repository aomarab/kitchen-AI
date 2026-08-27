import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

export { useReminderSettings, useUpdateReminderSettings } from './settings';

const OCCURRENCES_KEY = ['reminders', 'occurrences'] as const;

/**
 * The nudges fired today. Polled, because delivery in this phase *is* the
 * ledger — there is no push channel yet (that is Feature 4), so a client
 * notices a nudge by asking.
 */
export function useReminderOccurrences() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: OCCURRENCES_KEY,
    queryFn: () => api.call('listReminderOccurrences', { query: {} }),
    enabled: ready,
    refetchInterval: 60_000,
  });
}

export function useAcknowledgeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('acknowledgeReminder', { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: OCCURRENCES_KEY }),
  });
}
