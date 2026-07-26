import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job as BullJob } from 'bullmq';
import { JOB_STORE, QUEUE_RECEIPT } from '../ai.constants.js';
import { ReceiptService } from '../receipt/receipt.service.js';
import type { JobStore } from './job-store.js';
import type { ReceiptJobPayload } from './jobs.service.js';
import { toJobError } from './job-error.js';

/**
 * BullMQ worker for receipt parsing. Produces a `recognition_session` the user
 * reviews — receipts never auto-commit to inventory (spec §5.3).
 */
@Processor(QUEUE_RECEIPT)
export class ReceiptProcessor extends WorkerHost {
  constructor(
    @Inject(JOB_STORE) private readonly store: JobStore,
    @Inject(ReceiptService) private readonly receipts: ReceiptService,
  ) {
    super();
  }

  async process(job: BullJob<{ jobId: string }>): Promise<void> {
    const jobId = job.data.jobId;
    const row = await this.store.load(jobId);
    if (!row) return;

    await this.store.markRunning(jobId);
    try {
      const payload = row.payload as unknown as ReceiptJobPayload;
      const sessionId = await this.receipts.process({
        householdId: row.householdId,
        userId: payload.userId,
        request: payload.request,
      });
      await this.store.markDone(jobId, { kind: 'recognition_session', id: sessionId });
    } catch (err) {
      await this.store.markFailed(jobId, toJobError(err));
      throw err;
    }
  }
}
