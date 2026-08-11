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
  /** Spend-group id written at enqueue so the processor can refund exactly this spend. */
  spendGroupId: string;
}

export interface ReceiptJobPayload {
  userId: string;
  request: ParseReceiptRequest;
  /** Spend-group id written at enqueue so the processor can refund exactly this spend. */
  spendGroupId: string;
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
    payload: Omit<PlanJobPayload, 'spendGroupId'>,
    idempotencyKey: string,
  ): Promise<Job> {
    const action = creditActionForScope(payload.request.scope);

    // Check affordability before creating a job row — a broke household should
    // never get a queued job entry.
    await this.credits.assertCanAfford(householdId, action);

    // Debit before persisting. If store.create fails we refund; if the process
    // dies here the spend is unreversed but no job row exists and no worker will
    // run, so the household is over-charged by one action — the smallest
    // possible leak. See spec §5.4.
    const spendGroupId = await this.credits.spend(householdId, action);

    let job;
    let created: boolean;
    try {
      const result = await this.store.create({
        householdId,
        type: 'plan.generate',
        idempotencyKey,
        payload: { ...payload, spendGroupId },
      });
      job = result.job;
      created = result.created;
    } catch (err) {
      await this.credits.refundSpendGroup(householdId, spendGroupId).catch(() => undefined);
      throw err;
    }

    if (!created) {
      // Idempotent replay: a job already exists for this key. Refund the spend
      // we just took — the original job's spendGroupId covers the work.
      await this.credits.refundSpendGroup(householdId, spendGroupId);

      // Re-enqueue if the existing job is still non-terminal so a client that
      // retried after a queue blip can self-heal without support.
      if (this.planQueue && (job.status === 'queued' || job.status === 'running')) {
        await this.planQueue
          .add('generate', { jobId: job.id }, { jobId: job.id })
          .catch(() => undefined);
      }
      return toJob(job);
    }

    if (this.planQueue) {
      try {
        await this.planQueue.add('generate', { jobId: job.id }, { jobId: job.id });
      } catch (err) {
        // queue.add failed: refund and mark the job terminal so the client
        // gets a deterministic error and the balance is restored.
        await this.credits.refundSpendGroup(householdId, spendGroupId).catch(() => undefined);
        await this.store.markFailed(job.id, {
          code: 'QUEUE_UNAVAILABLE',
          messageKey: 'errors.INTERNAL_ERROR',
        });
        throw err;
      }
    }
    return toJob(job);
  }

  async enqueueReceipt(
    householdId: string,
    payload: Omit<ReceiptJobPayload, 'spendGroupId'>,
    idempotencyKey: string,
  ): Promise<Job> {
    await this.credits.assertCanAfford(householdId, 'receipt.scan');
    const spendGroupId = await this.credits.spend(householdId, 'receipt.scan');

    let job;
    let created: boolean;
    try {
      const result = await this.store.create({
        householdId,
        type: 'receipt.parse',
        idempotencyKey,
        payload: { ...payload, spendGroupId },
      });
      job = result.job;
      created = result.created;
    } catch (err) {
      await this.credits.refundSpendGroup(householdId, spendGroupId).catch(() => undefined);
      throw err;
    }

    if (!created) {
      await this.credits.refundSpendGroup(householdId, spendGroupId);

      if (this.receiptQueue && (job.status === 'queued' || job.status === 'running')) {
        await this.receiptQueue
          .add('parse', { jobId: job.id }, { jobId: job.id })
          .catch(() => undefined);
      }
      return toJob(job);
    }

    if (this.receiptQueue) {
      try {
        await this.receiptQueue.add('parse', { jobId: job.id }, { jobId: job.id });
      } catch (err) {
        await this.credits.refundSpendGroup(householdId, spendGroupId).catch(() => undefined);
        await this.store.markFailed(job.id, {
          code: 'QUEUE_UNAVAILABLE',
          messageKey: 'errors.INTERNAL_ERROR',
        });
        throw err;
      }
    }
    return toJob(job);
  }

  async get(householdId: string, id: string): Promise<Job> {
    const row = await this.store.get(householdId, id);
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    return toJob(row);
  }
}
