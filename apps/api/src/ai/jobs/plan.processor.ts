import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job as BullJob } from 'bullmq';
import { JOB_STORE, QUEUE_PLAN } from '../ai.constants.js';
import { CreditsService } from '../../credits/credits.service.js';
import { PlannerService } from '../planner/planner.service.js';
import { PlanService } from '../plan/plan.service.js';
import { RecipeTranslationService } from '../recipes/translation.service.js';
import type { JobStore } from './job-store.js';
import type { PlanJobPayload } from './jobs.service.js';
import { describeJobError, toJobError } from './job-error.js';

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
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(RecipeTranslationService) private readonly translation: RecipeTranslationService,
  ) {
    super();
  }

  private readonly logger = new Logger(PlanProcessor.name);

  async process(job: BullJob<{ jobId: string }>): Promise<void> {
    const jobId = job.data.jobId;
    const row = await this.store.load(jobId);
    if (!row) return;

    await this.store.markRunning(jobId);
    const payload = row.payload as unknown as PlanJobPayload;
    try {
      const planId = await this.planner.generate({
        householdId: row.householdId,
        userId: payload.userId,
        request: payload.request,
      });
      // Marked done *before* warming so the client stops waiting the moment the
      // plan exists; the pictures land seconds later on the next poll. Warming
      // must never reach the catch block below — the plan is already saved and
      // already charged, so a YouTube failure here would refund and fail a job
      // that in fact succeeded.
      await this.store.markDone(jobId, { kind: 'meal_plan', id: planId });
      // Dish names in both languages, so a household that reads in the other
      // one gets a board it can read instead of the language the plan happened
      // to be generated in. One cheap call for the whole plan; recipe bodies
      // follow lazily when a dish is opened.
      await this.translation
        .warmPlanTitles(row.householdId, planId)
        .catch((err) => this.logger.warn(`job ${jobId} title translation failed: ${String(err)}`));
      await this.plans
        .warmMedia(row.householdId, planId)
        .catch((err) => this.logger.warn(`job ${jobId} media warm failed: ${String(err)}`));
    } catch (err) {
      // The persisted error is code-only. Without this line a failed job is
      // undiagnosable: no schema issues, no model, no reason.
      this.logger.error(`job ${jobId} failed: ${describeJobError(err)}`);
      // Refund by spend-group id so a re-executed process() (stalled-job
      // recovery, future retry) never refunds a different group. The
      // `not exists` reversal guard in refundSpendGroup makes this a true no-op
      // on the second call — idempotent without any coordination overhead.
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
