import { create } from 'zustand';
import type { Job, PlanScope } from '@kitchen/contracts';
import { errorMessageKey } from '../lib/errors';

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
  readyPlanId: string | null;
  start: (jobId: string, scope: PlanScope) => boolean;
  finishSuccess: (planId: string) => void;
  finishFailure: (error: Job['error']) => void;
  consumeReadyPlan: () => string | null;
  clearFailure: () => void;
  reset: () => void;
}

export type PlanGenerationViewState =
  | { kind: 'idle' }
  | { kind: 'generating'; jobId: string; scope: PlanScope; progress: number }
  | { kind: 'ready'; planId: string }
  | { kind: 'done'; planId: string }
  | { kind: 'failed'; failure: FailedPlanGeneration };

export interface PlanGenerationViewInput {
  active: ActivePlanGeneration | null;
  failure: FailedPlanGeneration | null;
  readyPlanId: string | null;
  job: Job | undefined;
  queryError: unknown;
}

function codeFromQueryError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return 'JOB_POLL_FAILED';
}

function failureFromQueryError(scope: PlanScope, error: unknown): FailedPlanGeneration {
  return {
    scope,
    error: {
      code: codeFromQueryError(error),
      messageKey: errorMessageKey(error),
    },
  };
}

const missingPlanError: Job['error'] = {
  code: 'JOB_RESULT_MISSING',
  messageKey: 'errors.INTERNAL_ERROR',
};

export function derivePlanGenerationView({
  active,
  failure,
  readyPlanId,
  job,
  queryError,
}: PlanGenerationViewInput): PlanGenerationViewState {
  if (!active) {
    if (readyPlanId) return { kind: 'ready', planId: readyPlanId };
    return failure ? { kind: 'failed', failure } : { kind: 'idle' };
  }

  if (queryError)
    return { kind: 'failed', failure: failureFromQueryError(active.scope, queryError) };

  if (job?.status === 'done') {
    return job.resultRef?.kind === 'meal_plan'
      ? { kind: 'done', planId: job.resultRef.id }
      : { kind: 'failed', failure: { scope: active.scope, error: missingPlanError } };
  }

  if (job?.status === 'failed') {
    return { kind: 'failed', failure: { scope: active.scope, error: job.error } };
  }

  return {
    kind: 'generating',
    jobId: active.jobId,
    scope: active.scope,
    progress: job?.progress ?? 0.42,
  };
}

export const usePlanGenerationStore = create<PlanGenerationState>((set) => ({
  active: null,
  failure: null,
  readyPlanId: null,
  start: (jobId, scope) => {
    let accepted = false;
    set((state) => {
      if (state.active) return state;
      accepted = true;
      return { active: { jobId, scope }, failure: null, readyPlanId: null };
    });
    return accepted;
  },
  finishSuccess: (planId) => set({ active: null, failure: null, readyPlanId: planId }),
  finishFailure: (error) =>
    set((state) => ({
      active: null,
      readyPlanId: null,
      failure: state.active ? { scope: state.active.scope, error } : state.failure,
    })),
  consumeReadyPlan: () => {
    let readyPlanId: string | null = null;
    set((state) => {
      readyPlanId = state.readyPlanId;
      return readyPlanId ? { readyPlanId: null } : state;
    });
    return readyPlanId;
  },
  clearFailure: () => set({ failure: null }),
  reset: () => set({ active: null, failure: null, readyPlanId: null }),
}));
