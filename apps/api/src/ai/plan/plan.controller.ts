import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  generatePlanRequestSchema,
  listPlansQuerySchema,
  regenerateEntryRequestSchema,
  updateEntryRequestSchema,
  type GeneratePlanRequest,
  type Job,
  type ListPlansQuery,
  type MealPlan,
  type MealPlanEntry,
  type PlanCoverage,
  type RegenerateEntryRequest,
  type UpdateEntryRequest,
} from '@kitchen/contracts';
import { RequiredIdempotencyKey, ZodPipe } from '../../common/http.js';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentHousehold } from '../../common/current-household.decorator.js';
import type { AuthUser, HouseholdContext } from '../../common/request-context.js';
import { PlanService } from './plan.service.js';
import { JobsService } from '../jobs/jobs.service.js';

/** Meal-plan endpoints (spec §5.4, §6.2). Generation is a polled job. */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class PlanController {
  constructor(
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  @Get('meal-plans')
  list(
    @CurrentHousehold() household: HouseholdContext,
    @Query(new ZodPipe(listPlansQuerySchema)) query: ListPlansQuery,
  ): Promise<MealPlan[]> {
    return this.plans.list(household.id, query);
  }

  @Post('meal-plans')
  generate(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @RequiredIdempotencyKey() idempotencyKey: string,
    @Body(new ZodPipe(generatePlanRequestSchema)) body: GeneratePlanRequest,
  ): Promise<Job> {
    return this.jobs.enqueuePlan(
      household.id,
      { userId: user.userId, request: body },
      idempotencyKey,
    );
  }

  @Get('meal-plans/:id')
  get(@CurrentHousehold() household: HouseholdContext, @Param('id') id: string): Promise<MealPlan> {
    return this.plans.get(household.id, id);
  }

  @Delete('meal-plans/:id')
  remove(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.plans.remove(household.id, id);
  }

  @Get('meal-plans/:id/coverage')
  coverage(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id') id: string,
  ): Promise<PlanCoverage> {
    return this.plans.coverage(household.id, id);
  }

  @Patch('meal-plans/:id/entries/:entryId')
  updateEntry(
    @CurrentHousehold() household: HouseholdContext,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(updateEntryRequestSchema)) body: UpdateEntryRequest,
  ): Promise<MealPlanEntry> {
    return this.plans.updateEntry(household.id, id, entryId, body);
  }

  @Post('meal-plans/:id/entries/:entryId/regenerate')
  regenerateEntry(
    @CurrentHousehold() household: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(regenerateEntryRequestSchema)) body: RegenerateEntryRequest,
  ): Promise<MealPlanEntry> {
    return this.plans.regenerateEntry(household.id, user.userId, id, entryId, body);
  }
}
