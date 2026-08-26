import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { qk } from './keys';

export function useReminderSettings() {
  return useQuery({ queryKey: qk.reminders, queryFn: () => api.call('getReminderSettings') });
}

export function useUpdateReminderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'updateReminderSettings'>) =>
      api.call('updateReminderSettings', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reminders }),
  });
}
