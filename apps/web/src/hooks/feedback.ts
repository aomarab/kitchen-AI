import { useMutation } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (body: RouteBody<'submitFeedback'>) => {
      // Attach a no-op rejection handler before returning so Node.js (and
      // Vitest) never see an unhandled-rejection event for this promise.
      // TanStack Query's retryer chains .then(resolve).catch(handler) on the
      // returned promise, but because it uses Promise.resolve(p).then(resolve)
      // (fulfillment-only), `p` itself would otherwise have no rejection
      // handler, which triggers unhandledRejection in Node 20+.
      const p = api.call('submitFeedback', { body });
      p.catch(() => undefined);
      return p;
    },
  });
}
