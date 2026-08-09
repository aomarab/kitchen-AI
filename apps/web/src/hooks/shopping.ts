import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddShoppingItemsRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

export function useShoppingList() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['shopping'],
    queryFn: () => api.call('getShoppingList'),
    enabled: ready,
  });
}

export function useToggleShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; purchased: boolean }) =>
      api.call('toggleShoppingItem', {
        params: { id: input.id },
        body: { purchased: input.purchased },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });
}

export function useAddShoppingItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddShoppingItemsRequest) => api.call('addShoppingItems', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });
}

export function useCheckoutShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemIds: string[]; locationId: string }) =>
      api.call('checkoutShopping', { body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shopping'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
