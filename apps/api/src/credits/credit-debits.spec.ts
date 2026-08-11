import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CREDIT_COSTS } from '@kitchen/contracts';
import { creditActionForScope } from './credit-actions.js';
import { createTestContext, seedHousehold, seedUser, cleanup } from '../testing/harness.js';
import { creditLedger } from '../db/schema.js';
import { CreditsService } from './credits.service.js';

describe('creditActionForScope', () => {
  it('maps each plan scope to its priced action', () => {
    expect(creditActionForScope('daily')).toBe('plan.daily');
    expect(creditActionForScope('weekly')).toBe('plan.weekly');
    expect(creditActionForScope('monthly')).toBe('plan.monthly');
  });

  it('prices a monthly plan far above a daily one', () => {
    expect(CREDIT_COSTS[creditActionForScope('monthly')]).toBeGreaterThan(
      CREDIT_COSTS[creditActionForScope('daily')] * 10,
    );
  });
});

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

describe('job refund', () => {
  let householdId: string;
  let credits: CreditsService;

  beforeEach(async () => {
    const userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);
    createdUsers.push(userId);
    createdHouseholds.push(householdId);
    credits = new CreditsService(ctx.db);
  });

  it('restores the full debit and writes a reversal when a plan job fails', async () => {
    const before = await credits.balance(householdId);
    const action = creditActionForScope('weekly');

    await credits.spend(householdId, action);
    const during = await credits.balance(householdId);
    expect(during.freeBalance).toBe(before.freeBalance - CREDIT_COSTS[action]);

    // What plan.processor.ts does in its catch block.
    await credits.refund(householdId, action);

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
    expect(after.paidBalance).toBe(before.paidBalance);

    const rows = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.householdId, householdId));
    // A spend group can produce TWO reversal rows (cross-bucket) or one with
    // delta 0 (clamped sentinel), so sum the group rather than reading the
    // first `reversal` row.
    const spendGroupId = rows.find((r) => r.kind === 'spend')?.spendGroupId;
    expect(spendGroupId).toBeTruthy();
    const reversed = rows
      .filter((r) => r.kind === 'reversal' && r.spendGroupId === spendGroupId)
      .reduce((sum, r) => sum + r.delta, 0);
    expect(reversed).toBe(CREDIT_COSTS[action]);
  });
});
