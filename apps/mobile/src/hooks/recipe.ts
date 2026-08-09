import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import type { Locale } from '@kitchen/i18n';
import { api } from '../lib/api';
import { uuidv4 } from '../lib/uuid';
import { qk } from './keys';

export function useRecipe(id: string | null, locale: Locale) {
  return useQuery({
    queryKey: qk.recipe(id ?? 'none', locale),
    queryFn: () => api.call('getRecipe', { params: { id: id! }, query: { locale } }),
    enabled: !!id,
  });
}

export function useRecipeVideos(id: string | null) {
  return useQuery({
    queryKey: qk.recipeVideos(id ?? 'none'),
    queryFn: () => api.call('getRecipeVideos', { params: { id: id! } }),
    enabled: !!id,
  });
}

/**
 * "Cooked it" — logs the meal and (by default) auto-deducts its ingredients
 * from inventory server-side. Invalidates inventory so stock updates.
 */
export function useMarkCooked(recipeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'markRecipeCooked'>) =>
      api.call('markRecipeCooked', { params: { id: recipeId }, body, idempotencyKey: uuidv4() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.inventory });
      void qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}
