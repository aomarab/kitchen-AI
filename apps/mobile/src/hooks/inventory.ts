import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListInventoryQuery, RouteBody } from '@kitchen/contracts';
import type { MakeEventParams } from '../lib/event-queue';
import { api } from '../lib/api';
import { useOfflineQueue } from '../stores/offline-queue';
import { flushInventoryQueue } from './offline-sync';
import { qk } from './keys';

export function useLocations() {
  return useQuery({ queryKey: qk.locations, queryFn: () => api.call('listLocations') });
}

export function useInventory(query: Partial<ListInventoryQuery> = {}) {
  return useQuery({
    queryKey: qk.inventoryList(query),
    queryFn: () => api.call('listInventory', { query }),
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'createLocation'>) => api.call('createLocation', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations }),
  });
}

export function useUpdateInventoryItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'updateInventoryItem'>) =>
      api.call('updateInventoryItem', { params: { id }, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.inventory }),
  });
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('deleteInventoryItem', { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.inventory }),
  });
}

/** Commit reviewed capture rows. Never called automatically (spec §5.1). */
export function useBulkCreateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'bulkCreateInventory'>) =>
      api.call('bulkCreateInventory', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.inventory }),
  });
}

/**
 * Adjust an item's quantity through the append-only event ledger. The event is
 * queued durably first (offline-safe), then an immediate flush attempts to sync
 * it. Replay is idempotent, so this is safe if the network drops mid-call.
 */
export function useAdjustQuantity() {
  const enqueue = useOfflineQueue((state) => state.enqueue);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: MakeEventParams) => {
      enqueue(params);
      await flushInventoryQueue();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.inventory }),
  });
}
