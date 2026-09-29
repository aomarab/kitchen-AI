import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@kitchen/api-client';
import type { Job } from '@kitchen/contracts';
import { derivePlanGenerationView, usePlanGenerationStore } from './plan-generation';

const error: Job['error'] = {
  code: 'PLAN_FAILED',
  messageKey: 'errors.PLAN_GENERATION_FAILED',
};

const active = { jobId: 'job-1', scope: 'weekly' } as const;

function job(overrides: Partial<Job>): Job {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'plan.generate',
    status: 'running',
    progress: 0.42,
    resultRef: null,
    error: null,
    createdAt: '2026-09-29T12:00:00.000Z',
    finishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  usePlanGenerationStore.getState().reset();
});

describe('usePlanGenerationStore', () => {
  it('stores the active generation job and scope until the Plans tab polls it', () => {
    expect(usePlanGenerationStore.getState().start('job-1', 'weekly')).toBe(true);

    expect(usePlanGenerationStore.getState().active).toEqual({
      jobId: 'job-1',
      scope: 'weekly',
    });
    expect(usePlanGenerationStore.getState().failure).toBeNull();
  });

  it('blocks a second active generation instead of orphaning the first job', () => {
    expect(usePlanGenerationStore.getState().start('job-1', 'weekly')).toBe(true);
    expect(usePlanGenerationStore.getState().start('job-2', 'monthly')).toBe(false);

    expect(usePlanGenerationStore.getState().active).toEqual({
      jobId: 'job-1',
      scope: 'weekly',
    });
  });

  it('clears active and failed state after a successful job transition', () => {
    usePlanGenerationStore.getState().start('job-1', 'daily');
    usePlanGenerationStore.getState().finishFailure(error);
    usePlanGenerationStore.getState().start('job-2', 'monthly');

    usePlanGenerationStore.getState().finishSuccess();

    expect(usePlanGenerationStore.getState().active).toBeNull();
    expect(usePlanGenerationStore.getState().failure).toBeNull();
  });

  it('clears the active job and keeps the failed scope plus error for Retry', () => {
    usePlanGenerationStore.getState().start('job-1', 'monthly');

    usePlanGenerationStore.getState().finishFailure(error);

    expect(usePlanGenerationStore.getState().active).toBeNull();
    expect(usePlanGenerationStore.getState().failure).toEqual({
      scope: 'monthly',
      error,
    });
  });

  it('clears a failed transition before retrying on the Generate screen', () => {
    usePlanGenerationStore.getState().start('job-1', 'weekly');
    usePlanGenerationStore.getState().finishFailure(error);

    usePlanGenerationStore.getState().clearFailure();

    expect(usePlanGenerationStore.getState().failure).toBeNull();
  });
});

describe('derivePlanGenerationView', () => {
  it('keeps rendering the generating state while the active job query is still loading', () => {
    expect(
      derivePlanGenerationView({
        active,
        failure: null,
        job: undefined,
        queryError: null,
      }),
    ).toEqual({
      kind: 'generating',
      jobId: 'job-1',
      scope: 'weekly',
      progress: 0.42,
    });
  });

  it('returns the plan detail target when the active job finishes successfully', () => {
    expect(
      derivePlanGenerationView({
        active,
        failure: null,
        job: job({
          status: 'done',
          progress: 1,
          resultRef: {
            kind: 'meal_plan',
            id: '22222222-2222-4222-8222-222222222222',
          },
          finishedAt: '2026-09-29T12:01:00.000Z',
        }),
        queryError: null,
      }),
    ).toEqual({ kind: 'done', planId: '22222222-2222-4222-8222-222222222222' });
  });

  it('turns a failed job into a retryable Plans-tab failure state', () => {
    expect(
      derivePlanGenerationView({
        active: { jobId: 'job-1', scope: 'monthly' },
        failure: null,
        job: job({ status: 'failed', error }),
        queryError: null,
      }),
    ).toEqual({
      kind: 'failed',
      failure: {
        scope: 'monthly',
        error,
      },
    });
  });

  it('turns a stale or missing job query error into a retryable failure state', () => {
    const notFound = new ApiError(404, {
      code: 'NOT_FOUND',
      messageKey: 'errors.NOT_FOUND',
    });

    expect(
      derivePlanGenerationView({
        active,
        failure: null,
        job: undefined,
        queryError: notFound,
      }),
    ).toEqual({
      kind: 'failed',
      failure: {
        scope: 'weekly',
        error: {
          code: 'NOT_FOUND',
          messageKey: 'errors.NOT_FOUND',
        },
      },
    });
  });
});
