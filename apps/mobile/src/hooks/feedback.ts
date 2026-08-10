import { useMutation } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';

/**
 * Deliberately not queued offline. The offline event queue exists to keep the
 * inventory ledger summing; a rating replayed hours later against a build the
 * user has already updated past is worse than an honest "try again".
 */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (body: RouteBody<'submitFeedback'>) => api.call('submitFeedback', { body }),
  });
}
