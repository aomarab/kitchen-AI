import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { GeneratePlanRequest, Job, ParseReceiptRequest } from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import { CreditsService } from '../../credits/credits.service.js';
import { creditActionForScope } from '../../credits/credit-actions.js';
import { JOB_STORE, QUEUE_PLAN, QUEUE_RECEIPT } from '../ai.constants.js';
import { toJob, type JobStore } from './job-store.js';

/** Map a spend error to a job-failure envelope (preserves INSUFFICIENT_CREDITS code). */
function toSpendError(err: unknown): { code: string; messageKey: string } {
  if (err instanceof AppError) return { code: err.code, messageKey: err.messageKey };
  return { code: 'INTERNAL_ERROR', messageKey: 'errors.INTERNAL_ERROR' };
}

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

    // Mint the spend-group id here so it can live in the job payload before
    // the spend is committed. The order is:
    //   assertCanAfford → store.create (with spendGroupId in payload)
    //     → spend only when created=true → queue.add
    // A crash between create and spend leaves an uncharged job row with no
    // BullMQ entry — no worker can pick it up unpaid. A replay finds created=false
    // and never reaches spend, so the balance is untouched.
    const spendGroupId = crypto.randomUUID();

    const { job, created } = await this.store.create({
      householdId,
      type: 'plan.generate',
      idempotencyKey,
      payload: { ...payload, spendGroupId },
    });

    if (!created) {
      // Idempotent replay — zero balance movement.
      // Re-enqueue if still non-terminal so a client can self-heal a missing
      // BullMQ entry without needing support.
      if (this.planQueue && (job.status === 'queued' || job.status === 'running')) {
        await this.planQueue
          .add('generate', { jobId: job.id }, { jobId: job.id })
          .catch(() => undefined);
      }
      return toJob(job);
    }

    // New job — debit now that the row is persisted.
    try {
      await this.credits.spend(householdId, action, { spendGroupId });
    } catch (err) {
      // spend can fail if the balance was drained in the assertCanAfford→spend
      // window. Mark the job terminal so it is never picked up unpaid.
      await this.store.markFailed(job.id, toSpendError(err));
      throw err;
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

    const spendGroupId = crypto.randomUUID();

    const { job, created } = await this.store.create({
      householdId,
      type: 'receipt.parse',
      idempotencyKey,
      payload: { ...payload, spendGroupId },
    });

    if (!created) {
      if (this.receiptQueue && (job.status === 'queued' || job.status === 'running')) {
        await this.receiptQueue
          .add('parse', { jobId: job.id }, { jobId: job.id })
          .catch(() => undefined);
      }
      return toJob(job);
    }

    try {
      await this.credits.spend(householdId, 'receipt.scan', { spendGroupId });
    } catch (err) {
      await this.store.markFailed(job.id, toSpendError(err));
      throw err;
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
