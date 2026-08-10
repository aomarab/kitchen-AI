import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListInventoryQuery } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

export function useLocations() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => api.call('listLocations'),
    enabled: ready,
  });
}

export function useInventory(query: ListInventoryQuery = { limit: 50, sort: 'expiry' }) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['inventory', query],
    queryFn: () => api.call('listInventory', { query }),
    enabled: ready,
    // Changing a filter or search term produces a new key. Without this the
    // list unmounts to a spinner on every change; with it the previous results
    // stay on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('deleteInventoryItem', { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      expiresAt?: string | null;
      quantity?: number;
      brand?: string | null;
    }) =>
      api.call('updateInventoryItem', {
        params: { id: input.id },
        body: { quantity: input.quantity, expiresAt: input.expiresAt, brand: input.brand },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
}
