import { afterAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { VisionResult } from '@kitchen/contracts';
import { createTestContext, seedHousehold, seedUser, cleanup } from '../testing/harness.js';
import {
  aiUsage,
  creditLedger,
  householdCredits,
  mealPlanEntries,
  mealPlans,
  recipes,
} from '../db/schema.js';
import { CreditsService } from './credits.service.js';
import { AiGateway } from '../ai/ai-gateway.service.js';
import { SchemaGuard } from '../ai/validation/schema-guard.js';
import { BudgetService } from '../ai/usage/budget.service.js';
import { DrizzleUsageRepository } from '../ai/usage/usage.repository.js';
import { ActionCostQuery } from '../ai/usage/action-cost.query.js';
import { RecognitionService } from '../ai/recognition/recognition.service.js';
import { PlanService } from '../ai/plan/plan.service.js';
import { MediaService } from '../ai/recipes/media.service.js';
import { JobsService } from '../ai/jobs/jobs.service.js';
import { DrizzleJobStore } from '../ai/jobs/job-store.js';
import { PlanProcessor } from '../ai/jobs/plan.processor.js';
import { ReceiptProcessor } from '../ai/jobs/receipt.processor.js';
import type { RecipeTranslationService } from '../ai/recipes/translation.service.js';
import type { PlannerService } from '../ai/planner/planner.service.js';
import type { ReceiptService } from '../ai/receipt/receipt.service.js';
import type { AiProvider } from '../ai/providers/ai-provider.interface.js';
import type { IngredientResolverPort } from '../ai/catalog/ingredient-resolver.port.js';
import type { StorageService } from '../storage/storage.service.js';
import type { Env } from '../config/env.js';

/**
 * Proves that the vendor cost of an AI call can be traced back to the credit
 * action that paid for it.
 *
 * Before this, `ai_usage` recorded a household, a model and an operation, and
 * nothing about *why* the call happened — so "is `plan.daily` priced above what
 * it costs us?" was unanswerable from our own data, and the credit prices could
 * only be argued for in prose. These tests run the real gateway (real
 * `SchemaGuard`, real `BudgetService`, real `ai_usage` writes) behind a stub
 * provider, and then read the answer back through {@link ActionCostQuery}.
 */

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

async function seedCtx() {
  const userId = await seedUser(ctx.db);
  const householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  return { userId, householdId, credits: new CreditsService(ctx.db) };
}

const env = { AI_DAILY_BUDGET_USD: 100 } as Env;

/**
 * The real gateway, so usage rows are written by the code that writes them in
 * production rather than by the test. Only the vendor is stubbed.
 */
function realGateway(raw: unknown, model = 'gpt-5-mini') {
  const provider: AiProvider = {
    kind: 'mock',
    complete: vi.fn(async () => ({
      raw,
      usage: { inputTokens: 1000, outputTokens: 500 },
      model,
    })),
  };
  const budget = new BudgetService(new DrizzleUsageRepository(ctx.db), env);
  return { gateway: new AiGateway(provider, new SchemaGuard(), budget), provider };
}

const visionRaw: VisionResult = {
  ingredients: [
    {
      nameEn: 'Tomato',
      nameAr: 'طماطم',
      category: 'vegetable',
      estimatedQuantity: 200,
      unit: 'g',
      confidence: 0.95,
    },
  ],
};

function makeRecognitionService(credits: CreditsService, gateway: AiGateway) {
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
    providerImageUrl: vi.fn(async () => 'https://example.com/photo.jpg'),
  } as unknown as StorageService;

  return new RecognitionService(ctx.db, catalog, gateway, storage, credits);
}

/** The spend group the ledger recorded for `action` in this household. */
async function spendGroupFor(householdId: string, action: string): Promise<string> {
  const rows = await ctx.db
    .select({ spendGroupId: creditLedger.spendGroupId })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.householdId, householdId),
        eq(creditLedger.kind, 'spend'),
        eq(creditLedger.action, action),
      ),
    );
  const id = rows[0]?.spendGroupId;
  if (!id) throw new Error(`no spend recorded for ${action}`);
  return id;
}

async function usageFor(householdId: string) {
  return ctx.db.select().from(aiUsage).where(eq(aiUsage.householdId, householdId));
}

const since = new Date(Date.now() - 60 * 60 * 1000);

describe('pantry.scan attributes its vision calls to the spend that paid', () => {
  it('stamps every call of the action with the ledger spend group', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const { gateway } = realGateway(visionRaw);
    const svc = makeRecognitionService(credits, gateway);

    // Two photos: two vision calls, one charge. This is the case a single
    // `ai_usage_id` on the spend could never have represented.
    await svc.recognize({ householdId, userId, request: { photoKeys: ['a.jpg', 'b.jpg'] } });

    const group = await spendGroupFor(householdId, 'pantry.scan');
    const rows = await usageFor(householdId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.spendGroupId)).toEqual([group, group]);
    expect(rows.every((r) => Number(r.costUsd) > 0)).toBe(true);
  });

  it('reports the action, its charge and its measured cost together', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const { gateway } = realGateway(visionRaw);
    await makeRecognitionService(credits, gateway).recognize({
      householdId,
      userId,
      request: { photoKeys: ['a.jpg'] },
    });

    const rows = await new ActionCostQuery(ctx.db).byCreditAction({ since, householdId });
    const scan = rows.find((r) => r.action === 'pantry.scan');

    expect(scan).toBeDefined();
    expect(scan!.chargedCount).toBe(1);
    expect(scan!.measuredCount).toBe(1);
    expect(scan!.callCount).toBe(1);
    // 1000 in + 500 out on gpt-5-mini = $0.00015 + $0.0003.
    expect(scan!.costUsd).toBeCloseTo(0.00045, 6);
  });

  it('does not attribute one household usage to another', async () => {
    const a = await seedCtx();
    const b = await seedCtx();
    const { gateway } = realGateway(visionRaw);

    await makeRecognitionService(a.credits, gateway).recognize({
      householdId: a.householdId,
      userId: a.userId,
      request: { photoKeys: ['a.jpg'] },
    });

    const rows = await new ActionCostQuery(ctx.db).byCreditAction({
      since,
      householdId: b.householdId,
    });
    expect(rows).toEqual([]);
  });
});

describe('plan.regenerateEntry attributes a call made below it', () => {
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

  it('attributes the planner\u2019s own gateway call to the regeneration', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const { planId, entryId, recipeId } = await seedPlanEntry(householdId);
    const { gateway } = realGateway({ ok: true }, 'gpt-5');

    // A planner that calls the gateway itself — the layer of indirection an
    // explicitly threaded parameter would have had to cross.
    const planner = {
      regenerateEntry: vi.fn(async () => {
        await gateway.execute({
          householdId,
          operation: 'plan.generate',
          prompt: { system: 's', user: 'u', version: 'test' },
          schema: { safeParse: (raw: unknown) => ({ success: true, data: raw }) } as never,
        });
        return { recipeId, servings: 2, fullyCovered: true };
      }),
    } as unknown as PlannerService;

    const svc = new PlanService(
      ctx.db,
      undefined as never,
      planner,
      credits,
      new MediaService(ctx.db, undefined as never),
    );
    await svc.regenerateEntry(householdId, userId, planId, entryId, { excludeRecipeIds: [] });

    const group = await spendGroupFor(householdId, 'plan.regenerateEntry');
    const rows = await usageFor(householdId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.spendGroupId).toBe(group);
  });

  it('counts a split spend\u2019s cost once, not once per ledger row', async () => {
    const { userId, householdId, credits } = await seedCtx();
    const { planId, entryId, recipeId } = await seedPlanEntry(householdId);

    // Force the free/paid boundary: `plan.regenerateEntry` costs 2, so one
    // free credit makes the spend write *two* ledger rows for one action. A
    // join that did not collapse them first would double every usage row's
    // cost — and every price derived from it.
    await credits.balance(householdId);
    await ctx.db
      .update(householdCredits)
      .set({ freeBalance: 1, paidBalance: 10 })
      .where(eq(householdCredits.householdId, householdId));

    const { gateway } = realGateway({ ok: true }, 'gpt-5');
    const planner = {
      regenerateEntry: vi.fn(async () => {
        await gateway.execute({
          householdId,
          operation: 'plan.generate',
          prompt: { system: 's', user: 'u', version: 'test' },
          schema: { safeParse: (raw: unknown) => ({ success: true, data: raw }) } as never,
        });
        return { recipeId, servings: 2, fullyCovered: true };
      }),
    } as unknown as PlannerService;

    await new PlanService(
      ctx.db,
      undefined as never,
      planner,
      credits,
      new MediaService(ctx.db, undefined as never),
    ).regenerateEntry(householdId, userId, planId, entryId, { excludeRecipeIds: [] });

    const spendRows = await ctx.db
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.householdId, householdId), eq(creditLedger.kind, 'spend')));
    expect(spendRows).toHaveLength(2);

    const [reported] = await new ActionCostQuery(ctx.db).byCreditAction({ since, householdId });
    // 1000 in + 500 out on gpt-5 = $0.0025 + $0.005, counted once.
    expect(reported?.costUsd).toBeCloseTo(0.0075, 6);
    expect(reported?.callCount).toBe(1);
    expect(reported?.creditsCharged).toBe(2);
  });
});

describe('a plan job attributes work done by the worker to the enqueue spend', () => {
  it('carries the spend group from the job payload into ai_usage', async () => {
    const { householdId, credits } = await seedCtx();
    const store = new DrizzleJobStore(ctx.db);
    const jobs = new JobsService(store, credits, undefined, undefined);

    const job = await jobs.enqueuePlan(
      householdId,
      { userId: 'u1', request: { scope: 'daily', startsOn: '2026-08-04' } },
      `idem-attribution-${householdId}`,
    );

    const { gateway } = realGateway({ ok: true }, 'gpt-5');
    const planner = {
      generate: vi.fn(async () => {
        await gateway.execute({
          householdId,
          operation: 'plan.generate',
          prompt: { system: 's', user: 'u', version: 'test' },
          schema: { safeParse: (raw: unknown) => ({ success: true, data: raw }) } as never,
        });
        return 'plan-id';
      }),
    } as unknown as PlannerService;

    const processor = new PlanProcessor(
      store,
      planner,
      credits,
      { warmMedia: async () => 0 } as never,
      { warmPlanTitles: async () => 0 } as unknown as RecipeTranslationService,
    );
    await processor.process({ data: { jobId: job.id } } as never);

    const group = await spendGroupFor(householdId, 'plan.daily');
    const rows = await usageFor(householdId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.spendGroupId).toBe(group);

    const [reported] = await new ActionCostQuery(ctx.db).byCreditAction({ since, householdId });
    expect(reported?.action).toBe('plan.daily');
    expect(reported?.measuredCount).toBe(1);
  });
});

describe('a receipt job attributes both of its calls to the enqueue spend', () => {
  it('groups the extraction and the mapping under one charge', async () => {
    const { householdId, credits } = await seedCtx();
    const store = new DrizzleJobStore(ctx.db);
    const jobs = new JobsService(store, credits, undefined, undefined);

    const job = await jobs.enqueueReceipt(
      householdId,
      { userId: 'u1', request: { photoKeys: ['receipt.jpg'] } },
      `idem-receipt-attribution-${householdId}`,
    );

    const { gateway } = realGateway({ ok: true }, 'gpt-5-mini');
    const receipts = {
      // A receipt is two model calls — extract, then map — and one charge.
      process: vi.fn(async () => {
        for (const operation of ['receipt.extract', 'receipt.map'] as const) {
          await gateway.execute({
            householdId,
            operation,
            prompt: { system: 's', user: 'u', version: 'test' },
            schema: { safeParse: (raw: unknown) => ({ success: true, data: raw }) } as never,
          });
        }
        return 'session-id';
      }),
    } as unknown as ReceiptService;

    await new ReceiptProcessor(store, receipts, credits).process({
      data: { jobId: job.id },
    } as never);

    const group = await spendGroupFor(householdId, 'receipt.scan');
    const rows = await usageFor(householdId);
    expect(rows.map((r) => r.spendGroupId)).toEqual([group, group]);

    const [reported] = await new ActionCostQuery(ctx.db).byCreditAction({ since, householdId });
    expect(reported?.action).toBe('receipt.scan');
    expect(reported?.callCount).toBe(2);
    expect(reported?.chargedCount).toBe(1);
  });
});

describe('work nobody was charged for stays unattributed', () => {
  it('records media warming as usage with no action', async () => {
    const { householdId } = await seedCtx();
    const { gateway } = realGateway({ ok: true });

    // No billing context: this is the shape of a background warm or a
    // translation triggered outside an action.
    await gateway.execute({
      householdId,
      operation: 'recipe.translate',
      prompt: { system: 's', user: 'u', version: 'test' },
      schema: { safeParse: (raw: unknown) => ({ success: true, data: raw }) } as never,
    });

    const rows = await usageFor(householdId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.spendGroupId).toBeNull();

    // And it is excluded from every action's measured cost rather than being
    // silently folded into one.
    const reported = await new ActionCostQuery(ctx.db).byCreditAction({ since, householdId });
    expect(reported).toEqual([]);
  });
});
