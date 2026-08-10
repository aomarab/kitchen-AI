import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListFeedbackQuery, RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

type Filters = Pick<ListFeedbackQuery, 'status' | 'rating' | 'platform'>;

export const adminKeys = {
  stats: ['admin', 'feedback', 'stats'] as const,
  list: (filters: Filters) => ['admin', 'feedback', 'list', filters] as const,
  detail: (id: string) => ['admin', 'feedback', id] as const,
};

export function useFeedbackStats() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: adminKeys.stats,
    queryFn: () => api.call('adminFeedbackStats'),
    enabled: ready,
    retry: false,
  });
}

export function useFeedbackList(filters: Filters) {
  const ready = useMocksReady();
  return useInfiniteQuery({
    queryKey: adminKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.call('adminListFeedback', {
        query: { ...filters, limit: 25, cursor: pageParam ?? undefined },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? null,
    enabled: ready,
  });
}

export function useFeedbackDetail(id: string) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: adminKeys.detail(id),
    queryFn: () => api.call('adminGetFeedback', { params: { id } }),
    enabled: ready && id.length > 0,
  });
}

export function useUpdateFeedback(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'adminUpdateFeedback'>) =>
      api.call('adminUpdateFeedback', { params: { id }, body }),
    onSuccess: (updated) => {
      qc.setQueryData(adminKeys.detail(id), updated);
      // The list shows status badges and the strip shows per-status counts;
      // both are now stale for this row.
      void qc.invalidateQueries({ queryKey: ['admin', 'feedback', 'list'] });
      void qc.invalidateQueries({ queryKey: adminKeys.stats });
    },
  });
}
