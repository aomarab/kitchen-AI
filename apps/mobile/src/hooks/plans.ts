import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListPlansQuery, RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { uuidv4 } from '../lib/uuid';
import { qk } from './keys';

export function usePlans(query?: ListPlansQuery) {
  return useQuery({
    queryKey: qk.plans(query),
    queryFn: () => api.call('listPlans', { query: query ?? {} }),
  });
}

export function usePlan(id: string | null) {
  return useQuery({
    queryKey: qk.plan(id ?? 'none'),
    queryFn: () => api.call('getPlan', { params: { id: id! } }),
    enabled: !!id,
  });
}

export function usePlanCoverage(id: string | null) {
  return useQuery({
    queryKey: qk.planCoverage(id ?? 'none'),
    queryFn: () => api.call('getPlanCoverage', { params: { id: id! } }),
    enabled: !!id,
  });
}

/** Start generation. Returns a job the caller polls with `useJob`. */
export function useGeneratePlan() {
  return useMutation({
    mutationFn: (body: RouteBody<'generatePlan'>) =>
      api.call('generatePlan', { body, idempotencyKey: uuidv4() }),
  });
}

export function useUpdatePlanEntry(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; body: RouteBody<'updatePlanEntry'> }) =>
      api.call('updatePlanEntry', { params: { id: planId, entryId: vars.entryId }, body: vars.body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.plan(planId) });
      void qc.invalidateQueries({ queryKey: qk.planCoverage(planId) });
    },
  });
}

/** Swap a single entry for a different AI-generated meal. */
export function useRegeneratePlanEntry(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { entryId: string; body: RouteBody<'regeneratePlanEntry'> }) =>
      api.call('regeneratePlanEntry', {
        params: { id: planId, entryId: vars.entryId },
        body: vars.body,
        idempotencyKey: uuidv4(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.plan(planId) });
      void qc.invalidateQueries({ queryKey: qk.planCoverage(planId) });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('deletePlan', { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });
}
