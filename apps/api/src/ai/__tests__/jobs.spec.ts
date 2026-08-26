import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { GeneratePlanRequest } from '@kitchen/contracts';
import { JobsService } from '../jobs/jobs.service.js';
import type { CreateJobInput, JobRow, JobStore } from '../jobs/job-store.js';
import type { CreditsService } from '../../credits/credits.service.js';
import { uuid } from './helpers.js';

/** In-memory job store honouring the (household,type,key) idempotency contract. */
function fakeStore(): JobStore {
  const byKey = new Map<string, JobRow>();
  return {
    async create(input: CreateJobInput) {
      const key = `${input.householdId}:${input.type}:${input.idempotencyKey ?? ''}`;
      const existing = byKey.get(key);
      if (existing) return { job: existing, created: false };
      const job: JobRow = {
        id: uuid(),
        householdId: input.householdId,
        type: input.type,
        status: 'queued',
        idempotencyKey: input.idempotencyKey,
        progress: '0',
        payload: input.payload,
        result: null,
        error: null,
        attempts: 0,
        createdAt: new Date(),
        finishedAt: null,
      };
      byKey.set(key, job);
      return { job, created: true };
    },
    async get() {
      return null;
    },
    async load() {
      return null;
    },
    async markRunning() {},
    async setProgress() {},
    async markDone() {},
    async markFailed() {},
  };
}

const noopCredits: CreditsService = {
  spend: async () => 'fake-group-id',
  refundSpendGroup: async () => {},
  assertCanAfford: async () => {},
} as unknown as CreditsService;

const request = { scope: 'daily', startsOn: '2026-08-01' } as GeneratePlanRequest;

describe('JobsService idempotency (spec §3.3 — a double tap cannot create two plans)', () => {
  it('returns the same job and enqueues once for a repeated idempotency key', async () => {
    const add = vi.fn(async () => undefined);
    const queue = { add } as unknown as Queue;
    const service = new JobsService(fakeStore(), noopCredits, queue, undefined);

    const first = await service.enqueuePlan('hh', { userId: 'u1', request }, 'key-123');
    const second = await service.enqueuePlan('hh', { userId: 'u1', request }, 'key-123');

    expect(second.id).toBe(first.id);
    // add may be called twice — once for the new job, once for the idempotent
    // replay self-heal (re-enqueue with the same jobId is a BullMQ no-op).
    expect(add).toHaveBeenCalledWith('generate', { jobId: first.id }, { jobId: first.id });
  });

  it('creates distinct jobs for distinct idempotency keys', async () => {
    const add = vi.fn(async () => undefined);
    const queue = { add } as unknown as Queue;
    const service = new JobsService(fakeStore(), noopCredits, queue, undefined);

    const a = await service.enqueuePlan('hh', { userId: 'u1', request }, 'key-a');
    const b = await service.enqueuePlan('hh', { userId: 'u1', request }, 'key-b');

    expect(a.id).not.toBe(b.id);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
