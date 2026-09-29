import { create } from 'zustand';
import type { Job, PlanScope } from '@kitchen/contracts';

export interface ActivePlanGeneration {
  jobId: string;
  scope: PlanScope;
}

export interface FailedPlanGeneration {
  scope: PlanScope;
  error: Job['error'];
}

export interface PlanGenerationState {
  active: ActivePlanGeneration | null;
  failure: FailedPlanGeneration | null;
  start: (jobId: string, scope: PlanScope) => void;
  finishSuccess: () => void;
  finishFailure: (error: Job['error']) => void;
  clearFailure: () => void;
  reset: () => void;
}

export const usePlanGenerationStore = create<PlanGenerationState>((set) => ({
  active: null,
  failure: null,
  start: (jobId, scope) => set({ active: { jobId, scope }, failure: null }),
  finishSuccess: () => set({ active: null, failure: null }),
  finishFailure: (error) =>
    set((state) => ({
      active: null,
      failure: state.active ? { scope: state.active.scope, error } : state.failure,
    })),
  clearFailure: () => set({ failure: null }),
  reset: () => set({ active: null, failure: null }),
}));
