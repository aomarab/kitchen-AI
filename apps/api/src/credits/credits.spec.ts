import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CREDIT_COSTS, FREE_MONTHLY_GRANT } from '@kitchen/contracts';
import { createTestContext, seedHousehold, seedUser, cleanup } from '../testing/harness.js';
import { creditLedger, householdCredits } from '../db/schema.js';
import { CreditsService, currentGrantPeriod } from './credits.service.js';

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];
let userId: string;
let householdId: string;
let credits: CreditsService;

beforeAll(() => {
  credits = new CreditsService(ctx.db);
});

beforeEach(async () => {
  userId = await seedUser(ctx.db);
  householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
});

// Households are deleted before users: the FK ordering matters.
afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

describe('CreditsService', () => {
  it('gives a brand-new household the full free grant', async () => {
    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(balance.paidBalance).toBe(0);
    expect(balance.grantPeriod).toBe(currentGrantPeriod());
  });

  it('spends free credits first', async () => {
    await credits.grantPurchase(householdId, 300, null);
    await credits.spend(householdId, 'pantry.scan');
    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT - CREDIT_COSTS['pantry.scan']);
    expect(balance.paidBalance).toBe(300);
  });

  it('spills into paid credits when free runs short', async () => {
    // Drain free to 2, then spend a 4-credit action.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 2 })
      .where(eq(householdCredits.householdId, householdId));
    await credits.grantPurchase(householdId, 300, null);

    await credits.spend(householdId, 'plan.daily');

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(0);
    expect(balance.paidBalance).toBe(298);
  });

  it('throws INSUFFICIENT_CREDITS and moves nothing when short', async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 1, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    await expect(credits.spend(householdId, 'plan.monthly')).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      details: { required: 50, balance: 1 },
    });

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(1);
  });

  it('resets the free grant when the month rolls over, leaving paid untouched', async () => {
    await credits.grantPurchase(householdId, 300, null);
    await credits.spend(householdId, 'plan.weekly');
    await ctx.db
      .update(householdCredits)
      .set({ grantPeriod: '2000-01', freeBalance: 3 })
      .where(eq(householdCredits.householdId, householdId));

    const balance = await credits.balance(householdId);

    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(balance.paidBalance).toBe(300);
    expect(balance.grantPeriod).toBe(currentGrantPeriod());
  });

  it('never lets concurrent spends overdraw the balance', async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 10, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    // 10 parallel 4-credit spends against a 10-credit balance: exactly 2 win.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => credits.spend(householdId, 'plan.daily')),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;

    expect(ok).toBe(2);
    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(2);
    expect(balance.paidBalance).toBe(0);
  });

  it('writes an append-only ledger row per movement', async () => {
    await credits.spend(householdId, 'pantry.scan');
    await credits.refund(householdId, 'pantry.scan');

    const rows = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.householdId, householdId));

    const kinds = rows.map((r) => r.kind).sort();
    expect(kinds).toEqual(['grant', 'reversal', 'spend']);
    expect(rows.find((r) => r.kind === 'spend')?.delta).toBe(-1);
    expect(rows.find((r) => r.kind === 'reversal')?.delta).toBe(1);
  });

  it('refunds to the same bucket the spend came from', async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 0, paidBalance: 100 })
      .where(eq(householdCredits.householdId, householdId));

    await credits.spend(householdId, 'plan.daily');
    await credits.refund(householdId, 'plan.daily');

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(0);
    expect(balance.paidBalance).toBe(100);
  });

  it('assertCanAfford passes when affordable and moves nothing', async () => {
    await credits.assertCanAfford(householdId, 'pantry.scan');

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT);
  });

  it('assertCanAfford throws INSUFFICIENT_CREDITS when short', async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 0, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    await expect(credits.assertCanAfford(householdId, 'plan.monthly')).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });
  });
});
