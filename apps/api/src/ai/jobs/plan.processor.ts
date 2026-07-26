import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job as BullJob } from 'bullmq';
import { JOB_STORE, QUEUE_PLAN } from '../ai.constants.js';
import { PlannerService } from '../planner/planner.service.js';
import type { JobStore } from './job-store.js';
import type { PlanJobPayload } from './jobs.service.js';
import { toJobError } from './job-error.js';

/**
 * BullMQ worker for meal-plan generation. Thin by design: it loads the
 * persisted job, runs the three-stage planner, and records the resulting
 * plan id (or the failure) so the client can poll `getJob` (spec §3.3).
 */
@Processor(QUEUE_PLAN)
export class PlanProcessor extends WorkerHost {
  constructor(
    @Inject(JOB_STORE) private readonly store: JobStore,
    @Inject(PlannerService) private readonly planner: PlannerService,
  ) {
    super();
  }

  async process(job: BullJob<{ jobId: string }>): Promise<void> {
    const jobId = job.data.jobId;
    const row = await this.store.load(jobId);
    if (!row) return;

    await this.store.markRunning(jobId);
    try {
      const payload = row.payload as unknown as PlanJobPayload;
      const planId = await this.planner.generate({
        householdId: row.householdId,
        userId: payload.userId,
        request: payload.request,
      });
      await this.store.markDone(jobId, { kind: 'meal_plan', id: planId });
    } catch (err) {
      await this.store.markFailed(jobId, toJobError(err));
      throw err;
    }
  }
}
