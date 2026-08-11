import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { GeneratePlanRequest, Job, ParseReceiptRequest } from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import { CreditsService } from '../../credits/credits.service.js';
import { creditActionForScope } from '../../credits/credit-actions.js';
import { JOB_STORE, QUEUE_PLAN, QUEUE_RECEIPT } from '../ai.constants.js';
import { toJob, type JobStore } from './job-store.js';

export interface PlanJobPayload {
  userId: string;
  request: GeneratePlanRequest;
}

export interface ReceiptJobPayload {
  userId: string;
  request: ParseReceiptRequest;
}

/**
 * Creates and tracks background jobs. Creation is idempotent on the client
 * supplied idempotency key, so a double tap cannot create two plans (spec §3.3).
 * The BullMQ queues are optional so the service can be unit-tested without a
 * live Redis; in production the module wires the real queues.
 */
@Injectable()
export class JobsService {
  constructor(
    @Inject(JOB_STORE) private readonly store: JobStore,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Optional() @InjectQueue(QUEUE_PLAN) private readonly planQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_RECEIPT) private readonly receiptQueue?: Queue,
  ) {}

  async enqueuePlan(
    householdId: string,
    payload: PlanJobPayload,
    idempotencyKey: string | null,
  ): Promise<Job> {
    const action = creditActionForScope(payload.request.scope);

    // Check affordability before creating a job row — a broke household should
    // never get a queued job entry.
    await this.credits.assertCanAfford(householdId, action);

    const { job, created } = await this.store.create({
      householdId,
      type: 'plan.generate',
      idempotencyKey,
      payload: { ...payload },
    });

    // Only charge for genuinely new work. A replayed idempotency key returns
    // the original job: no new work will run, so the balance must not move.
    if (created) {
      try {
        await this.credits.spend(householdId, action);
      } catch (err) {
        // spend threw (race: balance drained between assertCanAfford and here).
        // Mark the job failed so the client gets a deterministic terminal state.
        await this.store.markFailed(job.id, {
          code: 'INSUFFICIENT_CREDITS',
          messageKey: 'errors.INSUFFICIENT_CREDITS',
        });
        throw err;
      }
    }

    if (created && this.planQueue) {
      await this.planQueue.add('generate', { jobId: job.id }, { jobId: job.id });
    }
    return toJob(job);
  }

  async enqueueReceipt(
    householdId: string,
    payload: ReceiptJobPayload,
    idempotencyKey: string | null,
  ): Promise<Job> {
    await this.credits.assertCanAfford(householdId, 'receipt.scan');

    const { job, created } = await this.store.create({
      householdId,
      type: 'receipt.parse',
      idempotencyKey,
      payload: { ...payload },
    });

    if (created) {
      try {
        await this.credits.spend(householdId, 'receipt.scan');
      } catch (err) {
        await this.store.markFailed(job.id, {
          code: 'INSUFFICIENT_CREDITS',
          messageKey: 'errors.INSUFFICIENT_CREDITS',
        });
        throw err;
      }
    }

    if (created && this.receiptQueue) {
      await this.receiptQueue.add('parse', { jobId: job.id }, { jobId: job.id });
    }
    return toJob(job);
  }

  async get(householdId: string, id: string): Promise<Job> {
    const row = await this.store.get(householdId, id);
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    return toJob(row);
  }
}
