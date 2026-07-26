import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    mutationFn: (input: { id: string; expiresAt?: string | null; quantity?: number }) =>
      api.call('updateInventoryItem', {
        params: { id: input.id },
        body: { quantity: input.quantity, expiresAt: input.expiresAt },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
}
