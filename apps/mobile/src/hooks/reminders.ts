import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { qk } from './keys';

export function useReminderSettings() {
  return useQuery({ queryKey: qk.reminders, queryFn: () => api.call('getReminderSettings') });
}

/**
 * Today's fired nudges. Polled rather than pushed: the firing engine writes the
 * ledger server-side, so a nudge that fired while the phone was asleep only
 * becomes visible on the next read. Sixty seconds is well inside the tightest
 * cadence the settings allow (30 minutes).
 */
export function useReminderOccurrences() {
  return useQuery({
    queryKey: qk.reminderOccurrences,
    queryFn: () => api.call('listReminderOccurrences', { query: {} }),
    refetchInterval: 60_000,
  });
}

export function useAcknowledgeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('acknowledgeReminder', { params: { id } }),
    onSuccess: (occurrence) => {
      qc.setQueryData(qk.reminderOccurrences, (previous?: typeof occurrence[]) =>
        previous?.map((o) => (o.id === occurrence.id ? occurrence : o)),
      );
    },
  });
}

export function useUpdateReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'updateReminderSettings'>) =>
      api.call('updateReminderSettings', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reminders }),
  });
}
