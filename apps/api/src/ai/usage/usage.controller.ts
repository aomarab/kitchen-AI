import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AiUsageSummary } from '@kitchen/contracts';
import { AuthGuard } from '../../common/auth.guard.js';
import { HouseholdGuard } from '../../common/household.guard.js';
import { CurrentHousehold } from '../../common/current-household.decorator.js';
import type { HouseholdContext } from '../../common/request-context.js';
import { BudgetService } from '../usage/budget.service.js';

/** AI usage/budget endpoint (spec §5.6). */
@Controller()
@UseGuards(AuthGuard, HouseholdGuard)
export class UsageController {
  constructor(@Inject(BudgetService) private readonly budget: BudgetService) {}

  @Get('ai/usage')
  usage(@CurrentHousehold() household: HouseholdContext): Promise<AiUsageSummary> {
    return this.budget.summary(household.id);
  }
}
