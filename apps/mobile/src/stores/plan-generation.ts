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
  start: (jobId: string, scope: PlanScope) => boolean;
  finishSuccess: () => void;
  finishFailure: (error: Job['error']) => void;
  clearFailure: () => void;
  reset: () => void;
}

export type PlanGenerationViewState =
  | { kind: 'idle' }
  | { kind: 'generating'; jobId: string; scope: PlanScope; progress: number }
  | { kind: 'done'; planId: string }
  | { kind: 'failed'; failure: FailedPlanGeneration };

export interface PlanGenerationViewInput {
  active: ActivePlanGeneration | null;
  failure: FailedPlanGeneration | null;
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
  job,
  queryError,
}: PlanGenerationViewInput): PlanGenerationViewState {
  if (!active) return failure ? { kind: 'failed', failure } : { kind: 'idle' };

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
  start: (jobId, scope) => {
    let accepted = false;
    set((state) => {
      if (state.active) return state;
      accepted = true;
      return { active: { jobId, scope }, failure: null };
    });
    return accepted;
  },
  finishSuccess: () => set({ active: null, failure: null }),
  finishFailure: (error) =>
    set((state) => ({
      active: null,
      failure: state.active ? { scope: state.active.scope, error } : state.failure,
    })),
  clearFailure: () => set({ failure: null }),
  reset: () => set({ active: null, failure: null }),
}));
