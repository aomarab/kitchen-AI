import { describe, expect, it } from 'vitest';
import { currentBillingContext, runInBillingContext } from '../usage/billing-context.js';
import { BudgetService } from '../usage/budget.service.js';
import type { Env } from '../../config/env.js';
import type { AiUsageRow, UsageRepository } from '../usage/usage.repository.js';

function repo(records: AiUsageRow[]): UsageRepository {
  return {
    async todaySpendUsd() {
      return 0;
    },
    async todayCallCount() {
      return records.length;
    },
    async record(row) {
      records.push(row);
    },
  };
}

const env = { AI_DAILY_BUDGET_USD: 10 } as Env;

async function recordOnce(records: AiUsageRow[]): Promise<void> {
  await new BudgetService(repo(records), env).record({
    householdId: 'hh',
    model: 'mock-planning',
    operation: 'plan.generate',
    tier: 'planning',
    usage: { inputTokens: 1000, outputTokens: 500 },
  });
}

describe('billing context (attributing vendor cost to a credit action)', () => {
  it('is absent outside any action', () => {
    expect(currentBillingContext()).toBeUndefined();
  });

  it('reaches a call made arbitrarily deep inside the action', async () => {
    const deep = async () => {
      await Promise.resolve();
      return currentBillingContext();
    };
    const nested = async () => deep();

    const seen = await runInBillingContext({ spendGroupId: 'group-1', action: 'plan.daily' }, () =>
      nested(),
    );

    expect(seen).toEqual({ spendGroupId: 'group-1', action: 'plan.daily' });
  });

  it('does not leak out of the action that entered it', async () => {
    await runInBillingContext({ spendGroupId: 'group-1', action: 'plan.daily' }, async () => {
      expect(currentBillingContext()?.spendGroupId).toBe('group-1');
    });
    expect(currentBillingContext()).toBeUndefined();
  });

  it('keeps two concurrent actions apart', async () => {
    // The failure this guards against is the reason the context is
    // AsyncLocalStorage and not a module-level variable: two households
    // scanning at once must not be billed into each other's spend group.
    const run = async (id: string, delayMs: number) =>
      runInBillingContext({ spendGroupId: id, action: 'pantry.scan' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return currentBillingContext()?.spendGroupId;
      });

    const [first, second] = await Promise.all([run('group-a', 20), run('group-b', 1)]);

    expect(first).toBe('group-a');
    expect(second).toBe('group-b');
  });

  it('runs unattributed when no spend group is known', async () => {
    const seen = await runInBillingContext(undefined, async () => currentBillingContext());
    expect(seen).toBeUndefined();
  });
});

describe('BudgetService records the action that paid', () => {
  it('stamps the spend group on the usage row', async () => {
    const records: AiUsageRow[] = [];
    await runInBillingContext({ spendGroupId: 'group-1', action: 'plan.daily' }, () =>
      recordOnce(records),
    );
    expect(records[0]?.spendGroupId).toBe('group-1');
  });

  it('leaves the usage row unattributed when nobody was charged', async () => {
    // Media warming and background translation are real vendor spend that no
    // credit paid for. An unattributed row says so; inventing an action here
    // would overstate what an action costs.
    const records: AiUsageRow[] = [];
    await recordOnce(records);
    expect(records[0]?.spendGroupId).toBeUndefined();
  });
});
