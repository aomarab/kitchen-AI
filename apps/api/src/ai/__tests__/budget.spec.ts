import { describe, expect, it } from 'vitest';
import { BudgetService } from '../usage/budget.service.js';
import type { Env } from '../../config/env.js';
import type { AiUsageRow, UsageRepository } from '../usage/usage.repository.js';

function repo(spend: number, records: AiUsageRow[] = []): UsageRepository {
  return {
    async todaySpendUsd() {
      return spend;
    },
    async todayCallCount() {
      return records.length;
    },
    async record(row) {
      records.push(row);
    },
  };
}

const env = { AI_DAILY_BUDGET_USD: 2 } as Env;

describe('BudgetService (spec §5.6 — enforce budget before the call)', () => {
  it('allows a call when spend is below budget', async () => {
    const service = new BudgetService(repo(0.5), env);
    await expect(service.assertWithinBudget('hh')).resolves.toBeUndefined();
  });

  it('throws QUOTA_EXCEEDED when spend meets or exceeds budget', async () => {
    const service = new BudgetService(repo(2), env);
    await expect(service.assertWithinBudget('hh')).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
  });

  it('records a call and reports it in the usage summary', async () => {
    const records: AiUsageRow[] = [];
    const service = new BudgetService(repo(0, records), env);
    await service.record({
      householdId: 'hh',
      model: 'mock-planning',
      operation: 'plan.generate',
      tier: 'planning',
      usage: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(records).toHaveLength(1);

    const summary = await service.summary('hh');
    expect(summary.householdId).toBe('hh');
    expect(summary.budgetUsd).toBe(2);
    expect(summary.callCount).toBe(1);
  });
});
