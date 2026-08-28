import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job as BullJob } from 'bullmq';
import { JOB_STORE, QUEUE_RECEIPT } from '../ai.constants.js';
import { CreditsService } from '../../credits/credits.service.js';
import { ReceiptService } from '../receipt/receipt.service.js';
import type { JobStore } from './job-store.js';
import type { ReceiptJobPayload } from './jobs.service.js';
import { describeJobError, toJobError } from './job-error.js';
import { runInBillingContext } from '../usage/billing-context.js';

/**
 * BullMQ worker for receipt parsing. Produces a `recognition_session` the user
 * reviews — receipts never auto-commit to inventory (spec §5.3).
 */
@Processor(QUEUE_RECEIPT)
export class ReceiptProcessor extends WorkerHost {
  constructor(
    @Inject(JOB_STORE) private readonly store: JobStore,
    @Inject(ReceiptService) private readonly receipts: ReceiptService,
    @Inject(CreditsService) private readonly credits: CreditsService,
  ) {
    super();
  }

  private readonly logger = new Logger(ReceiptProcessor.name);

  async process(job: BullJob<{ jobId: string }>): Promise<void> {
    const jobId = job.data.jobId;
    const row = await this.store.load(jobId);
    if (!row) return;

    await this.store.markRunning(jobId);
    const payload = row.payload as unknown as ReceiptJobPayload;
    try {
      // The whole parse — extraction, mapping and the catalog resolution it
      // triggers — is attributed to the spend made at enqueue.
      const sessionId = await runInBillingContext(
        payload.spendGroupId
          ? { spendGroupId: payload.spendGroupId, action: 'receipt.scan' }
          : undefined,
        () =>
          this.receipts.process({
            householdId: row.householdId,
            userId: payload.userId,
            request: payload.request,
          }),
      );
      await this.store.markDone(jobId, { kind: 'recognition_session', id: sessionId });
    } catch (err) {
      this.logger.error(`job ${jobId} failed: ${describeJobError(err)}`);
      if (payload.spendGroupId) {
        await this.credits
          .refundSpendGroup(row.householdId, payload.spendGroupId)
          .catch((refundError) =>
            this.logger.error(`job ${jobId} credit refund failed: ${String(refundError)}`),
          );
      }
      await this.store.markFailed(jobId, toJobError(err));
      throw err;
    }
  }
}
