import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GeneratePlanRequest,
  ListPlansQuery,
  UpdateEntryRequest,
} from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';
import { uuid } from '../mocks/db';

export function usePlans(query: ListPlansQuery = {}) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['plans', query],
    queryFn: () => api.call('listPlans', { query }),
    enabled: ready,
  });
}

export function usePlan(id: string | undefined) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['plan', id],
    queryFn: () => api.call('getPlan', { params: { id: id! } }),
    enabled: ready && Boolean(id),
  });
}

export function usePlanCoverage(id: string | undefined) {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['plan-coverage', id],
    queryFn: () => api.call('getPlanCoverage', { params: { id: id! } }),
    enabled: ready && Boolean(id),
  });
}

export function useGeneratePlan() {
  return useMutation({
    mutationFn: (body: GeneratePlanRequest) =>
      api.call('generatePlan', { body, idempotencyKey: uuid() }),
  });
}

export function useUpdateEntry(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { entryId: string; body: UpdateEntryRequest }) =>
      api.call('updatePlanEntry', {
        params: { id: planId, entryId: input.entryId },
        body: input.body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plan', planId] });
      void qc.invalidateQueries({ queryKey: ['plan-coverage', planId] });
    },
  });
}

export function useRegenerateEntry(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { entryId: string; excludeRecipeIds?: string[] }) =>
      api.call('regeneratePlanEntry', {
        params: { id: planId, entryId: input.entryId },
        body: { excludeRecipeIds: input.excludeRecipeIds ?? [] },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plan', planId] });
      void qc.invalidateQueries({ queryKey: ['plan-coverage', planId] });
    },
  });
}
