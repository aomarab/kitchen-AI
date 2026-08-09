import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { GeneratePlanRequest, Job, ParseReceiptRequest } from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
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
    @Optional() @InjectQueue(QUEUE_PLAN) private readonly planQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_RECEIPT) private readonly receiptQueue?: Queue,
  ) {}

  async enqueuePlan(
    householdId: string,
    payload: PlanJobPayload,
    idempotencyKey: string | null,
  ): Promise<Job> {
    const { job, created } = await this.store.create({
      householdId,
      type: 'plan.generate',
      idempotencyKey,
      payload: { ...payload },
    });
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
    const { job, created } = await this.store.create({
      householdId,
      type: 'receipt.parse',
      idempotencyKey,
      payload: { ...payload },
    });
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
