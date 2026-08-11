import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { CREDIT_COSTS } from '@kitchen/contracts';
import type { VisionResult } from '@kitchen/contracts';
import { creditActionForScope } from './credit-actions.js';
import { createTestContext, seedHousehold, seedUser, cleanup } from '../testing/harness.js';
import {
  creditLedger,
  householdCredits,
  mealPlanEntries,
  mealPlans,
  recipes,
} from '../db/schema.js';
import { CreditsService } from './credits.service.js';
import { RecognitionService } from '../ai/recognition/recognition.service.js';
import { PlanService } from '../ai/plan/plan.service.js';
import { JobsService } from '../ai/jobs/jobs.service.js';
import { DrizzleJobStore } from '../ai/jobs/job-store.js';
import { PlanProcessor } from '../ai/jobs/plan.processor.js';
import { ReceiptProcessor } from '../ai/jobs/receipt.processor.js';
import type { AiGateway } from '../ai/ai-gateway.service.js';
import type { IngredientResolverPort } from '../ai/catalog/ingredient-resolver.port.js';
import type { StorageService } from '../storage/storage.service.js';
import type { PlannerService } from '../ai/planner/planner.service.js';
import type { ReceiptService } from '../ai/receipt/receipt.service.js';

// ---------------------------------------------------------------------------
// Pure mapping tests
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Integration harness
// ---------------------------------------------------------------------------

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

/** Seed a fresh household and return its id + a ready CreditsService. */
async function seedCtx() {
  const userId = await seedUser(ctx.db);
  const householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  const credits = new CreditsService(ctx.db);
  return { userId, householdId, credits };
}

/** Sum all reversal deltas belonging to the first spend group in the ledger. */
async function reversalTotal(householdId: string): Promise<number> {
  const rows = await ctx.db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.householdId, householdId));
  const spendGroupId = rows.find((r) => r.kind === 'spend')?.spendGroupId;
  if (!spendGroupId) return 0;
  return rows
    .filter((r) => r.kind === 'reversal' && r.spendGroupId === spendGroupId)
    .reduce((sum, r) => sum + r.delta, 0);
}

/**
 * Zero out a household's balance by directly setting both buckets to 0.
 * This avoids spending loops that would pollute the ledger and slow the test.
 */
async function drainCredits(householdId: string, credits: CreditsService): Promise<void> {
  // Ensure the row exists first.
  await credits.balance(householdId);
  await ctx.db
    .update(householdCredits)
    .set({ freeBalance: sql`0`, paidBalance: sql`0` })
    .where(eq(householdCredits.householdId, householdId));
}

// ---------------------------------------------------------------------------
// RecognitionService debit site
// ---------------------------------------------------------------------------

/** Build a RecognitionService wired to a fake gateway that returns one ingredient. */
function makeRecognitionService(credits: CreditsService, gatewayImpl?: Partial<AiGateway>) {
  const fakeIngredient: VisionResult['ingredients'][0] = {
    nameEn: 'Tomato',
    nameAr: 'طماطم',
    category: 'vegetable',
    estimatedQuantity: 200,
    unit: 'g',
    confidence: 0.95,
  };
  const gateway = {
    execute: vi.fn(async () => ({ ingredients: [fakeIngredient] }) satisfies VisionResult),
    ...gatewayImpl,
  } as unknown as AiGateway;

  const catalog = {
    resolve: vi.fn(async (names: { name: string }[]) =>
      names.map((n) => ({
        rawName: n.name,
        ingredient: null,
        strategy: 'unresolved' as const,
        confidence: 0,
      })),
    ),
  } as unknown as IngredientResolverPort;

  const storage = {
    presignDownload: vi.fn(async () => 'https://example.com/photo.jpg'),
  } as unknown as StorageService;

  return new RecognitionService(ctx.db, catalog, gateway, storage, credits);
}

describe('RecognitionService debit site (pantry.scan)', () => {
  it('balance falls by CREDIT_COSTS[pantry.scan] after a successful scan', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const svc = makeRecognitionService(credits);
    const before = await credits.balance(householdId);

    await svc.recognize({
      householdId,
      userId,
      request: { photoKeys: ['photo-key-1'] },
    });

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance - CREDIT_COSTS['pantry.scan']);
  });

  it('refuses with INSUFFICIENT_CREDITS and leaves the balance unchanged when broke', async () => {
    const { userId, householdId, credits } = await seedCtx();
    await drainCredits(householdId, credits);
    const before = await credits.balance(householdId);
    const svc = makeRecognitionService(credits);
    await expect(
      svc.recognize({ householdId, userId, request: { photoKeys: ['photo-key-2'] } }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
  });

  it('does NOT debit when the provider call fails', async () => {
    const { userId, householdId, credits } = await seedCtx();
    // Gateway that throws after assertCanAfford has already passed.
    const svc = makeRecognitionService(credits, {
      execute: vi.fn(async () => {
        throw new Error('provider down');
      }),
    });
    const before = await credits.balance(householdId);
    await expect(
      svc.recognize({ householdId, userId, request: { photoKeys: ['photo-key-3'] } }),
    ).rejects.toThrow('provider down');
    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
  });
});

// ---------------------------------------------------------------------------
// PlanService.regenerateEntry debit site (plan.regenerateEntry)
// ---------------------------------------------------------------------------

/** Seed a recipe + plan + entry row so regenerateEntry has something to update. */
async function seedPlanEntry(householdId: string) {
  const [recipe] = await ctx.db
    .insert(recipes)
    .values({ householdId, titleEn: 'Test Recipe', servings: 2 })
    .returning({ id: recipes.id });

  const [plan] = await ctx.db
    .insert(mealPlans)
    .values({
      householdId,
      scope: 'weekly',
      startsOn: '2026-08-03',
      endsOn: '2026-08-09',
      status: 'ready',
      locale: 'en',
    })
    .returning({ id: mealPlans.id });

  const [entry] = await ctx.db
    .insert(mealPlanEntries)
    .values({
      planId: plan!.id,
      date: '2026-08-04',
      slot: 'lunch',
      recipeId: recipe!.id,
      servings: 2,
      position: 0,
    })
    .returning({ id: mealPlanEntries.id });

  return { planId: plan!.id, entryId: entry!.id, recipeId: recipe!.id };
}

function makePlanService(credits: CreditsService, plannerImpl?: Partial<PlannerService>) {
  const planner = {
    regenerateEntry: vi.fn(async () => ({
      recipeId: 'some-recipe-id',
      servings: 2,
      fullyCovered: true,
    })),
    ...plannerImpl,
  } as unknown as PlannerService;

  return new PlanService(ctx.db, undefined as never, planner, credits);
}

describe('PlanService.regenerateEntry debit site (plan.regenerateEntry)', () => {
  it('balance falls by CREDIT_COSTS[plan.regenerateEntry] after success', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const { planId, entryId, recipeId } = await seedPlanEntry(householdId);

    // Wire planner to point to the seeded recipe so the DB update works.
    const svc = makePlanService(credits, {
      regenerateEntry: vi.fn(async () => ({ recipeId, servings: 2, fullyCovered: true })),
    });

    const before = await credits.balance(householdId);
    await svc.regenerateEntry(householdId, userId, planId, entryId, { excludeRecipeIds: [] });
    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance - CREDIT_COSTS['plan.regenerateEntry']);
  });

  it('refuses with INSUFFICIENT_CREDITS and leaves balance unchanged when broke', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const { planId, entryId } = await seedPlanEntry(householdId);

    await drainCredits(householdId, credits);

    const before = await credits.balance(householdId);
    const svc = makePlanService(credits);
    await expect(
      svc.regenerateEntry(householdId, userId, planId, entryId, { excludeRecipeIds: [] }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
  });

  it('does NOT debit when the planner throws', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const { planId, entryId } = await seedPlanEntry(householdId);

    const svc = makePlanService(credits, {
      regenerateEntry: vi.fn(async () => {
        throw new Error('planner error');
      }),
    });

    const before = await credits.balance(householdId);
    await expect(
      svc.regenerateEntry(householdId, userId, planId, entryId, { excludeRecipeIds: [] }),
    ).rejects.toThrow('planner error');
    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
  });
});

// ---------------------------------------------------------------------------
// JobsService debit sites (enqueuePlan / enqueueReceipt)
// ---------------------------------------------------------------------------

function makeJobsService(credits: CreditsService) {
  const store = new DrizzleJobStore(ctx.db);
  return new JobsService(store, credits, undefined, undefined);
}

function makePlanProcessor(credits: CreditsService, plannerImpl?: Partial<PlannerService>) {
  const store = new DrizzleJobStore(ctx.db);
  const planner = {
    generate: vi.fn(async () => {
      throw new Error('planner failed');
    }),
    ...plannerImpl,
  } as unknown as PlannerService;
  return new PlanProcessor(store, planner, credits);
}

function makeReceiptProcessor(credits: CreditsService, receiptImpl?: Partial<ReceiptService>) {
  const store = new DrizzleJobStore(ctx.db);
  const receipts = {
    process: vi.fn(async () => {
      throw new Error('receipt service failed');
    }),
    ...receiptImpl,
  } as unknown as ReceiptService;
  return new ReceiptProcessor(store, receipts, credits);
}

describe('JobsService.enqueuePlan debit site (plan.daily)', () => {
  it('balance falls by CREDIT_COSTS[plan.daily] for a new job', async () => {
    const { householdId, credits } = await seedCtx();
    const svc = makeJobsService(credits);
    const before = await credits.balance(householdId);

    await svc.enqueuePlan(
      householdId,
      { userId: 'u1', request: { scope: 'daily', startsOn: '2026-08-04' } },
      null,
    );

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance - CREDIT_COSTS['plan.daily']);
  });

  it('refuses with INSUFFICIENT_CREDITS when broke', async () => {
    const { householdId, credits } = await seedCtx();
    await drainCredits(householdId, credits);
    const before = await credits.balance(householdId);
    const svc = makeJobsService(credits);
    await expect(
      svc.enqueuePlan(
        householdId,
        { userId: 'u1', request: { scope: 'daily', startsOn: '2026-08-04' } },
        null,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
  });

  it('balance moves exactly once for a repeated idempotency key', async () => {
    const { householdId, credits } = await seedCtx();
    const svc = makeJobsService(credits);
    const before = await credits.balance(householdId);

    await svc.enqueuePlan(
      householdId,
      { userId: 'u1', request: { scope: 'daily', startsOn: '2026-08-05' } },
      'idem-key-plan',
    );
    // Second call with the same idempotency key — must not charge again.
    await svc.enqueuePlan(
      householdId,
      { userId: 'u1', request: { scope: 'daily', startsOn: '2026-08-05' } },
      'idem-key-plan',
    );

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance - CREDIT_COSTS['plan.daily']);
  });
});

describe('JobsService.enqueueReceipt debit site (receipt.scan)', () => {
  it('balance falls by CREDIT_COSTS[receipt.scan] for a new job', async () => {
    const { householdId, credits } = await seedCtx();
    const svc = makeJobsService(credits);
    const before = await credits.balance(householdId);

    await svc.enqueueReceipt(
      householdId,
      { userId: 'u1', request: { photoKeys: ['receipt-photo.jpg'] } },
      null,
    );

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance - CREDIT_COSTS['receipt.scan']);
  });

  it('refuses with INSUFFICIENT_CREDITS when broke', async () => {
    const { householdId, credits } = await seedCtx();
    await drainCredits(householdId, credits);
    const before = await credits.balance(householdId);
    const svc = makeJobsService(credits);
    await expect(
      svc.enqueueReceipt(
        householdId,
        { userId: 'u1', request: { photoKeys: ['receipt-photo2.jpg'] } },
        null,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
  });

  it('balance moves exactly once for a repeated idempotency key', async () => {
    const { householdId, credits } = await seedCtx();
    const svc = makeJobsService(credits);
    const before = await credits.balance(householdId);

    await svc.enqueueReceipt(
      householdId,
      { userId: 'u1', request: { photoKeys: ['receipt-photo3.jpg'] } },
      'idem-key-receipt',
    );
    await svc.enqueueReceipt(
      householdId,
      { userId: 'u1', request: { photoKeys: ['receipt-photo3.jpg'] } },
      'idem-key-receipt',
    );

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance - CREDIT_COSTS['receipt.scan']);
  });
});

// ---------------------------------------------------------------------------
// PlanProcessor refund site
// ---------------------------------------------------------------------------

describe('PlanProcessor refund site', () => {
  it('restores the balance when the planner throws', async () => {
    const { householdId, credits } = await seedCtx();
    const jobsService = makeJobsService(credits);

    // Enqueue a real job so processor can load it.
    await jobsService.enqueuePlan(
      householdId,
      { userId: 'u1', request: { scope: 'weekly', startsOn: '2026-08-04' } },
      null,
    );
    const jobs = await ctx.db.query.jobs.findMany({
      where: (j, { eq: eqJ }) => eqJ(j.householdId, householdId),
    });
    const jobRow = jobs[0]!;

    const balanceAfterEnqueue = await credits.balance(householdId);

    const processor = makePlanProcessor(credits);
    // process() will throw after refunding — the throw is BullMQ's signal to retry.
    await expect(processor.process({ data: { jobId: jobRow.id } } as never)).rejects.toThrow(
      'planner failed',
    );

    const after = await credits.balance(householdId);
    // Balance should be restored after the refund.
    expect(after.freeBalance).toBeGreaterThan(balanceAfterEnqueue.freeBalance);

    const action = creditActionForScope('weekly');
    expect(await reversalTotal(householdId)).toBe(CREDIT_COSTS[action]);
  });
});

// ---------------------------------------------------------------------------
// ReceiptProcessor refund site
// ---------------------------------------------------------------------------

describe('ReceiptProcessor refund site', () => {
  it('restores the balance when the receipt service throws', async () => {
    const { householdId, credits } = await seedCtx();
    const jobsService = makeJobsService(credits);

    await jobsService.enqueueReceipt(
      householdId,
      { userId: 'u1', request: { photoKeys: ['receipt.jpg'] } },
      null,
    );
    const jobs = await ctx.db.query.jobs.findMany({
      where: (j, { eq: eqJ }) => eqJ(j.householdId, householdId),
    });
    const jobRow = jobs[0]!;

    const balanceAfterEnqueue = await credits.balance(householdId);

    const processor = makeReceiptProcessor(credits);
    await expect(processor.process({ data: { jobId: jobRow.id } } as never)).rejects.toThrow(
      'receipt service failed',
    );

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBeGreaterThan(balanceAfterEnqueue.freeBalance);
    expect(await reversalTotal(householdId)).toBe(CREDIT_COSTS['receipt.scan']);
  });
});

// ---------------------------------------------------------------------------
// Legacy: direct refund test (kept for regression coverage)
// ---------------------------------------------------------------------------

describe('job refund (direct CreditsService — regression)', () => {
  it('restores the full debit and writes a reversal when a plan job fails', async () => {
    const { householdId, credits } = await seedCtx();
    const before = await credits.balance(householdId);
    const action = creditActionForScope('weekly');

    await credits.spend(householdId, action);
    const during = await credits.balance(householdId);
    expect(during.freeBalance).toBe(before.freeBalance - CREDIT_COSTS[action]);

    await credits.refund(householdId, action);

    const after = await credits.balance(householdId);
    expect(after.freeBalance).toBe(before.freeBalance);
    expect(after.paidBalance).toBe(before.paidBalance);

    const rows = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.householdId, householdId));
    const spendGroupId = rows.find((r) => r.kind === 'spend')?.spendGroupId;
    expect(spendGroupId).toBeTruthy();
    const reversed = rows
      .filter((r) => r.kind === 'reversal' && r.spendGroupId === spendGroupId)
      .reduce((sum, r) => sum + r.delta, 0);
    expect(reversed).toBe(CREDIT_COSTS[action]);
  });
});
