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
  // Lazily create the credits row so tests that directly update householdCredits
  // find an existing row. This also exercises the create-branch on every test run.
  await credits.balance(householdId);
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

  it('creates the credits row lazily with exactly one grant ledger entry', async () => {
    // beforeEach already called balance() once — that is the create-branch.
    // Calling it again must not add another grant row.
    await credits.balance(householdId);
    const rows = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.householdId, householdId));
    expect(rows.filter((r) => r.kind === 'grant')).toHaveLength(1);
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

  it('never lets concurrent spends overdraw the balance (free-only baseline)', async () => {
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

  it('never lets concurrent spends drive freeBalance negative (mixed-bucket lock test)', async () => {
    // free=2, paid=100: total=102 can afford many plan.daily (cost 4).
    // Without FOR UPDATE the split is stale: two transactions both compute
    // fromFree=2,fromPaid=2 and both commit, driving freeBalance to -2.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 2, paidBalance: 100 })
      .where(eq(householdCredits.householdId, householdId));

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => credits.spend(householdId, 'plan.daily')),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;

    // All 10 spends can succeed: total=102, cost=4, floor(102/4)=25 > 10.
    expect(ok).toBe(10);

    const balance = await credits.balance(householdId);
    // freeBalance must never go negative.
    expect(balance.freeBalance).toBeGreaterThanOrEqual(0);
    // Total debited must equal ok * cost.
    expect(balance.freeBalance + balance.paidBalance).toBe(102 - ok * 4);
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

  // ── CRITICAL 1: refund correctness ──────────────────────────────────────────

  it('two spends then one refund: refunds exactly one spend, not both', async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 10, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    await credits.spend(householdId, 'pantry.scan'); // cost 1
    await credits.spend(householdId, 'pantry.scan'); // cost 1
    await credits.refund(householdId, 'pantry.scan');

    const balance = await credits.balance(householdId);
    // Started at 10, spent 2, refunded 1 → 9
    expect(balance.freeBalance).toBe(9);
  });

  it('one spend then two refunds: second refund is a no-op, credits not minted', async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 10, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    await credits.spend(householdId, 'pantry.scan'); // cost 1
    await credits.refund(householdId, 'pantry.scan'); // reverses the spend
    await credits.refund(householdId, 'pantry.scan'); // no unreversed spend → no-op

    const balance = await credits.balance(householdId);
    // Started at 10, net zero after spend+refund, second refund is no-op → 10
    expect(balance.freeBalance).toBe(10);
  });

  it('cross-bucket spend refunds to the correct buckets', async () => {
    // free=2, paid=10: a plan.daily (cost 4) takes 2 from free, 2 from paid.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 2, paidBalance: 10 })
      .where(eq(householdCredits.householdId, householdId));

    await credits.spend(householdId, 'plan.daily');
    await credits.refund(householdId, 'plan.daily');

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(2);
    expect(balance.paidBalance).toBe(10);
  });

  // ── CRITICAL 2: assertCanAfford / spend agree on negative paidBalance ───────

  it('assertCanAfford and spend both succeed when freeBalance covers cost despite negative paidBalance', async () => {
    // paidBalance=-10 is a legitimate post-refund state; freeBalance=150 covers cost=1.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 150, paidBalance: -10 })
      .where(eq(householdCredits.householdId, householdId));

    await expect(credits.assertCanAfford(householdId, 'pantry.scan')).resolves.toBeUndefined();
    await expect(credits.spend(householdId, 'pantry.scan')).resolves.toBeUndefined();

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(149);
    expect(balance.paidBalance).toBe(-10);
  });

  // ── CRITICAL 3: refund targets the most-recent spend, not the oldest ────────

  it('refunds the spend that just failed, not the oldest one', async () => {
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 2, paidBalance: 10 })
      .where(eq(householdCredits.householdId, householdId));

    // Spend 1: cost 4 -> 2 from free, 2 from paid. free=0, paid=8
    await credits.spend(householdId, 'plan.daily');
    // Spend 2: cost 4 -> 0 from free, 4 from paid. free=0, paid=4
    await credits.spend(householdId, 'plan.daily');

    const mid = await credits.balance(householdId);
    expect([mid.freeBalance, mid.paidBalance]).toEqual([0, 4]);

    // Spend 2's job fails. Reversing spend 2 must restore paid only.
    await credits.refund(householdId, 'plan.daily');

    const after = await credits.balance(householdId);
    expect([after.freeBalance, after.paidBalance]).toEqual([0, 8]);
  });

  // ── CRITICAL 4: free-balance clamp is safe and idempotent ───────────────────

  it('refund never pushes freeBalance above FREE_MONTHLY_GRANT and never lowers a balance', async () => {
    // freeBalance is already at the cap. A refund of a free spend must be a
    // no-op on the balance but still mark the group reversed.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: FREE_MONTHLY_GRANT, paidBalance: 0 })
      .where(eq(householdCredits.householdId, householdId));

    // Force a spend row into the ledger by temporarily draining free.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 10 })
      .where(eq(householdCredits.householdId, householdId));
    await credits.spend(householdId, 'pantry.scan'); // free=9
    // Restore free to cap to simulate the month rolling over.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: FREE_MONTHLY_GRANT })
      .where(eq(householdCredits.householdId, householdId));

    // Refund: free is already at cap, clamp should floor at 0, not go negative.
    await credits.refund(householdId, 'pantry.scan');

    const balance = await credits.balance(householdId);
    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT); // not above cap
    expect(balance.paidBalance).toBe(0); // not lowered

    // A second refund must be a no-op (group was marked reversed by the first).
    await credits.refund(householdId, 'pantry.scan');
    const balance2 = await credits.balance(householdId);
    expect(balance2.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(balance2.paidBalance).toBe(0);
  });

  // ── Important 5: seq-ordered SQL, not JS Date tie-breaking ──────────────────

  it('orders spend groups by seq, never by created_at', async () => {
    // `seq` is the authoritative recency key because `created_at` is not
    // reliable for ordering: two spends can collide at the resolution a client
    // compares them at, and the column is writable. This fixture makes the two
    // keys disagree on purpose — group A carries the LATER timestamp but is
    // inserted first, so it has the LOWER seq. Anything that orders by
    // created_at picks A; only seq ordering picks B.
    //
    // Group A: 2 from free. Group B: 4 from paid. The refund must reverse B.
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 2, paidBalance: 10 })
      .where(eq(householdCredits.householdId, householdId));

    const base = new Date();
    const groupA = crypto.randomUUID();
    const groupB = crypto.randomUUID();

    // Group A — inserted first (lower seq) but stamped a minute in the future.
    await ctx.db.insert(creditLedger).values({
      householdId,
      delta: -2,
      kind: 'spend',
      bucket: 'free',
      action: 'plan.daily',
      spendGroupId: groupA,
      createdAt: new Date(base.getTime() + 60_000),
    });
    // Group B — inserted second (higher seq) but stamped earlier.
    await ctx.db.insert(creditLedger).values({
      householdId,
      delta: -4,
      kind: 'spend',
      bucket: 'paid',
      action: 'plan.daily',
      spendGroupId: groupB,
      createdAt: base,
    });

    // Adjust balances to reflect the two "spends".
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 0, paidBalance: 6 })
      .where(eq(householdCredits.householdId, householdId));

    // Refund must reverse group B (4 paid), not group A (2 free).
    await credits.refund(householdId, 'plan.daily');

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(0); // group A not touched
    expect(after.paidBalance).toBe(10); // group B reversed: 6 + 4
  });
});
