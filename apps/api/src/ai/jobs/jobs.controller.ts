import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { Job } from '@kitchen/contracts';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import { CurrentHousehold } from '../../common/current-household.decorator.js';
import type { HouseholdContext } from '../../common/request-context.js';
import { JobsService } from './jobs.service.js';

/**
 * Job polling endpoint (spec §3.3). A job id is a bearer of information, so the
 * handler is scoped to the caller's verified household: polling another
 * household's job id returns NOT_FOUND (never FORBIDDEN) so ids cannot be probed
 * for existence. The ownership check lives in {@link JobsService.get}, which
 * only returns a row whose `householdId` matches the caller.
 */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Get('jobs/:id')
  get(@CurrentHousehold() household: HouseholdContext, @Param('id') id: string): Promise<Job> {
    return this.jobs.get(household.id, id);
  }
}
