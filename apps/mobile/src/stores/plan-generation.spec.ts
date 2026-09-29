import { beforeEach, describe, expect, it } from 'vitest';
import type { Job } from '@kitchen/contracts';
import { usePlanGenerationStore } from './plan-generation';

const error: Job['error'] = {
  code: 'PLAN_FAILED',
  messageKey: 'errors.PLAN_GENERATION_FAILED',
};

beforeEach(() => {
  usePlanGenerationStore.getState().reset();
});

describe('usePlanGenerationStore', () => {
  it('stores the active generation job and scope until the Plans tab polls it', () => {
    usePlanGenerationStore.getState().start('job-1', 'weekly');

    expect(usePlanGenerationStore.getState().active).toEqual({
      jobId: 'job-1',
      scope: 'weekly',
    });
    expect(usePlanGenerationStore.getState().failure).toBeNull();
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
