import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

export function useRecipe(id: string | undefined, locale: 'en' | 'ar') {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['recipe', id, locale],
    queryFn: () => api.call('getRecipe', { params: { id: id! }, query: { locale } }),
    enabled: ready && Boolean(id),
  });
}

export function useMarkCooked(recipeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mealPlanEntryId?: string | null; servings?: number }) =>
      api.call('markRecipeCooked', {
        params: { id: recipeId },
        body: {
          mealPlanEntryId: input.mealPlanEntryId ?? null,
          servings: input.servings,
          deductInventory: true,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['plan-coverage'] });
    },
  });
}
