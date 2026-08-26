import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListFeedbackQuery,
  ListProductFeedbackQuery,
  RouteBody,
} from '@kitchen/contracts';
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

/**
 * Every row matching the filters, not just the pages already on screen.
 *
 * An export that silently stopped at the first 25 rows would look successful
 * and be wrong, so this walks the cursor to the end before returning. The cap
 * exists so a runaway cursor cannot spin forever.
 */
export async function fetchAllFeedback(filters: Filters, maxRows = 5000) {
  const rows = [];
  let cursor: string | undefined;
  do {
    const page = await api.call('adminListFeedback', {
      query: { ...filters, limit: 100, cursor },
    });
    rows.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && rows.length < maxRows);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Product feedback (the vendor report)                                */
/* ------------------------------------------------------------------ */

export type ProductFilters = Pick<
  ListProductFeedbackQuery,
  'brand' | 'ingredientId' | 'maxAverage'
>;

export const productKeys = {
  list: (filters: ProductFilters) => ['admin', 'product-feedback', 'list', filters] as const,
  comments: (filters: ProductFilters) =>
    ['admin', 'product-feedback', 'comments', filters] as const,
};

export function useProductFeedbackList(filters: ProductFilters) {
  const ready = useMocksReady();
  return useInfiniteQuery({
    queryKey: productKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.call('adminListProductFeedback', {
        query: { ...filters, limit: 25, cursor: pageParam ?? undefined },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? null,
    enabled: ready,
  });
}

/** The comments for one vendor — what actually gets sent to them. */
export function useProductComments(filters: ProductFilters) {
  const ready = useMocksReady();
  return useInfiniteQuery({
    queryKey: productKeys.comments(filters),
    queryFn: ({ pageParam }) =>
      api.call('adminListProductComments', {
        query: {
          brand: filters.brand,
          ingredientId: filters.ingredientId,
          limit: 25,
          cursor: pageParam ?? undefined,
        },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? null,
    enabled: ready,
  });
}

/**
 * Every comment for a vendor, not just the loaded pages — the same reason
 * `fetchAllFeedback` walks the cursor: a export that stopped at 25 rows would
 * look successful and be wrong.
 */
export async function fetchAllProductComments(filters: ProductFilters, maxRows = 5000) {
  const rows = [];
  let cursor: string | undefined;
  do {
    const page = await api.call('adminListProductComments', {
      query: { brand: filters.brand, ingredientId: filters.ingredientId, limit: 100, cursor },
    });
    rows.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && rows.length < maxRows);
  return rows;
}
