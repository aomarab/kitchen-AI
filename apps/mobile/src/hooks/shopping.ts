import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { uuidv4 } from '../lib/uuid';
import { qk } from './keys';

export function useShoppingList() {
  return useQuery({ queryKey: qk.shopping, queryFn: () => api.call('getShoppingList') });
}

export function useAddShoppingItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'addShoppingItems'>) => api.call('addShoppingItems', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shopping }),
  });
}

export function useToggleShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; purchased: boolean }) =>
      api.call('toggleShoppingItem', { params: { id: vars.id }, body: { purchased: vars.purchased } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shopping }),
  });
}

/** Move purchased items into inventory (as `purchased` events, server-side). */
export function useCheckoutShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'checkoutShopping'>) =>
      api.call('checkoutShopping', { body, idempotencyKey: uuidv4() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.shopping });
      void qc.invalidateQueries({ queryKey: qk.inventory });
    },
  });
}
