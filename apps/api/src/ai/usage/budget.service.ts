import { Inject, Injectable } from '@nestjs/common';
import type { AiUsageSummary } from '@kitchen/contracts';
import { ENV, type Env } from '../../config/env.js';
import { AppError } from '../../common/errors.js';
import { estimateCostUsd, type AiOperation, type ModelTier } from '../ai.constants.js';
import type { TokenUsage } from '../providers/ai-provider.interface.js';
import { USAGE_REPOSITORY } from '../ai.constants.js';
import { currentBillingContext } from './billing-context.js';
import type { UsageRepository } from './usage.repository.js';

export interface RecordUsageInput {
  householdId: string;
  model: string;
  operation: AiOperation;
  tier: ModelTier;
  usage: TokenUsage;
}

/**
 * Enforces the per-household daily AI budget *before* a call (spec §5.6) and
 * records every call's spend in `ai_usage`. Exceeding the budget surfaces as
 * `QUOTA_EXCEEDED` with a localized message key.
 */
@Injectable()
export class BudgetService {
  constructor(
    @Inject(USAGE_REPOSITORY) private readonly repo: UsageRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async assertWithinBudget(householdId: string): Promise<void> {
    const spent = await this.repo.todaySpendUsd(householdId);
    if (spent >= this.env.AI_DAILY_BUDGET_USD) {
      throw new AppError('QUOTA_EXCEEDED', 'errors.QUOTA_EXCEEDED', {
        spentUsd: spent,
        budgetUsd: this.env.AI_DAILY_BUDGET_USD,
      });
    }
  }

  async record(input: RecordUsageInput): Promise<number> {
    const cost = estimateCostUsd(
      input.model,
      input.tier,
      input.usage.inputTokens,
      input.usage.outputTokens,
    );
    // Read here rather than taken as a parameter: this is the one place every
    // usage row is built, and the calls being attributed are made several
    // layers below whoever paid. See `billing-context.ts`.
    const billing = currentBillingContext();
    await this.repo.record({
      householdId: input.householdId,
      model: input.model,
      operation: input.operation,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      costUsd: cost,
      ...(billing ? { spendGroupId: billing.spendGroupId } : {}),
    });
    return cost;
  }

  async summary(householdId: string): Promise<AiUsageSummary> {
    const [spent, callCount] = await Promise.all([
      this.repo.todaySpendUsd(householdId),
      this.repo.todayCallCount(householdId),
    ]);
    const day = new Date().toISOString().slice(0, 10);
    return {
      householdId,
      day,
      spentUsd: Number(spent.toFixed(6)),
      budgetUsd: this.env.AI_DAILY_BUDGET_USD,
      callCount,
    };
  }
}
