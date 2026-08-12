import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListInventoryQuery, RouteBody } from '@kitchen/contracts';
import type { MakeEventParams } from '../lib/event-queue';
import { api } from '../lib/api';
import { useOfflineQueue } from '../stores/offline-queue';
import { flushInventoryQueue, currentOwner } from './offline-sync';
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

/**
 * A single item, fetched by id. The detail screen used to look its item up in
 * an unfiltered first page of 50 — so anything past #50, or reached from a
 * filtered list, rendered as NOT_FOUND on a row the user was looking at a
 * moment earlier.
 */
export function useInventoryItem(id: string) {
  return useQuery({
    queryKey: qk.inventoryItem(id),
    queryFn: () => api.call('getInventoryItem', { params: { id } }),
    enabled: id.length > 0,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'createLocation'>) => api.call('createLocation', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations }),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RouteBody<'updateLocation'> }) =>
      api.call('updateLocation', { params: { id }, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.locations }),
  });
}

/**
 * Deleting a place. `moveTo` sends its contents somewhere; without it the API
 * refuses a place that still holds food, and the screen turns that refusal
 * into the question of where the food should go.
 *
 * Invalidates inventory as well as locations: the items that moved are now in
 * a different place, so a cached list would show them where they no longer are.
 */
export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) =>
      api.call('deleteLocation', { params: { id }, query: moveTo ? { moveTo } : {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.locations });
      void qc.invalidateQueries({ queryKey: qk.inventory });
    },
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
      const owner = currentOwner();
      if (!owner) throw new Error('cannot queue an inventory event without an active household');
      enqueue(owner, params);
      await flushInventoryQueue();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.inventory }),
  });
}

/**
 * What this household and everyone else thinks of the product an item is.
 *
 * Keyed under the item rather than the product because the screen has an item
 * id and the server is what decides which product that is — mirroring that
 * decision on the client would mean two places that could disagree.
 */
export function useProductFeedback(itemId: string) {
  return useQuery({
    queryKey: qk.productFeedback(itemId),
    queryFn: () => api.call('getProductFeedback', { params: { id: itemId } }),
    enabled: itemId.length > 0,
  });
}

export function useSubmitProductFeedback(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'submitProductFeedback'>) =>
      api.call('submitProductFeedback', { params: { id: itemId }, body }),
    // Refetch rather than write the response in: submitting changes the shared
    // average too, and the response only carries this household's own review.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.productFeedback(itemId) }),
  });
}
