import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@kitchen/contracts';
import { cleanup, createTestContext, seedHousehold, seedUser, type TestContext } from '../../../testing/harness.js';
import { mealPlanEntries, mealPlans, recipes } from '../../../db/schema.js';
import { RecipeTranslationService } from '../translation.service.js';
import type { AiGateway } from '../../ai-gateway.service.js';

/** A gateway that answers with whatever the caller asked to be translated. */
function gatewayReturning(value: unknown): AiGateway & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    execute: vi.fn(async (input: { context?: unknown }) => {
      calls.push(input.context);
      return value;
    }),
  } as unknown as AiGateway & { calls: unknown[] };
}

function gatewayFailing(): AiGateway {
  return {
    execute: vi.fn(async () => {
      throw new Error('budget exceeded');
    }),
  } as unknown as AiGateway;
}

describe('RecipeTranslationService', () => {
  let ctx: TestContext;
  let userId: string;
  let householdId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
  });

  const seedRecipe = async (values: Record<string, unknown>) => {
    const [row] = await ctx.db
      .insert(recipes)
      .values({
        householdId,
        prepMinutes: 5,
        cookMinutes: 10,
        servings: 2,
        difficulty: 'easy',
        generatedBy: 'ai',
        ...values,
      } as never)
      .returning({ id: recipes.id });
    return row!.id;
  };

  const readRecipe = async (id: string) =>
    (await ctx.db.select().from(recipes).where(eq(recipes.id, id)))[0]!;

  describe('ensureRecipe', () => {
    /**
     * The planner writes one language and leaves the other null, so a reader who
     * switched languages was shown the language the recipe happened to be
     * generated in. This is the fill-in that makes the other language exist.
     */
    it('writes the missing language from the one that exists', async () => {
      const id = await seedRecipe({
        titleAr: 'شكشوكة',
        descriptionAr: 'فطور سريع',
        stepsAr: [{ index: 1, text: 'اكسر البيض', durationMinutes: 3 }],
      });
      const service = new RecipeTranslationService(
        ctx.db as never,
        gatewayReturning({ title: 'Shakshuka', description: 'A quick breakfast', steps: ['Crack the eggs'] }),
      );

      await expect(service.ensureRecipe(householdId, id, 'en')).resolves.toBe(true);

      const row = await readRecipe(id);
      expect(row.titleEn).toBe('Shakshuka');
      expect(row.titleAr).toBe('شكشوكة');
    });

    /** Timings describe the cooking, not the wording, so they survive a translation. */
    it('keeps step durations, which are not language', async () => {
      const id = await seedRecipe({
        titleAr: 'عجة',
        stepsAr: [{ index: 1, text: 'اخفق البيض', durationMinutes: 7 }],
      });
      const service = new RecipeTranslationService(
        ctx.db as never,
        gatewayReturning({ title: 'Omelette', description: '', steps: ['Beat the eggs'] }),
      );

      await service.ensureRecipe(householdId, id, 'en');

      const steps = (await readRecipe(id)).stepsEn as { text: string; durationMinutes: number }[];
      expect(steps[0]!.durationMinutes).toBe(7);
    });

    /** Translation is cached in the columns; a second read must not pay again. */
    it('does not translate a recipe that already has that language', async () => {
      const id = await seedRecipe({
        titleAr: 'حمص',
        titleEn: 'Hummus',
        stepsAr: [{ index: 1, text: 'اهرس', durationMinutes: null }],
        stepsEn: [{ index: 1, text: 'Mash', durationMinutes: null }],
      });
      const gateway = gatewayReturning({ title: 'x', description: '', steps: [] });
      const service = new RecipeTranslationService(ctx.db as never, gateway);

      await expect(service.ensureRecipe(householdId, id, 'en')).resolves.toBe(false);
      expect(gateway.calls).toHaveLength(0);
    });

    /**
     * Titles are filled in bulk before the bodies are, so a recipe can have a
     * title in a language and nothing else. Judging completeness on the title
     * alone would leave those recipes with permanently untranslated steps.
     */
    it('still translates the body when only the title was filled in', async () => {
      const id = await seedRecipe({
        titleAr: 'مجدرة',
        titleEn: 'Mujadara',
        stepsAr: [{ index: 1, text: 'اسلق العدس', durationMinutes: null }],
      });
      const service = new RecipeTranslationService(
        ctx.db as never,
        gatewayReturning({ title: 'Mujadara', description: '', steps: ['Boil the lentils'] }),
      );

      await expect(service.ensureRecipe(householdId, id, 'en')).resolves.toBe(true);
      const steps = (await readRecipe(id)).stepsEn as { text: string }[];
      expect(steps[0]!.text).toBe('Boil the lentils');
    });

    /**
     * A recipe that cannot be translated must stay readable in the language it
     * has. If this ever propagates, an AI budget cap turns into a broken screen.
     */
    it('leaves the recipe intact when translation fails', async () => {
      const id = await seedRecipe({ titleAr: 'فتة', stepsAr: [{ index: 1, text: 'سخن', durationMinutes: null }] });
      const service = new RecipeTranslationService(ctx.db as never, gatewayFailing());

      await expect(service.ensureRecipe(householdId, id, 'en')).resolves.toBe(false);
      expect((await readRecipe(id)).titleAr).toBe('فتة');
    });
  });

  describe('warmPlanTitles', () => {
    const seedPlan = async (locale: Locale, recipeIds: string[]) => {
      const [plan] = await ctx.db
        .insert(mealPlans)
        .values({
          householdId,
          scope: 'daily',
          startsOn: '2026-08-01',
          endsOn: '2026-08-01',
          status: 'ready',
          locale,
        } as never)
        .returning({ id: mealPlans.id });

      // One entry per plan/date/slot is a unique constraint, so entries get
      // distinct slots rather than a repeated one.
      const slots = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
      await ctx.db.insert(mealPlanEntries).values(
        recipeIds.map((recipeId, i) => ({
          planId: plan!.id,
          recipeId,
          date: '2026-08-01',
          position: i,
          slot: slots[i % slots.length]!,
          servings: 2,
        })) as never,
      );
      return plan!.id;
    };

    it('fills the dish names the plan is missing', async () => {
      const id = await seedRecipe({ titleAr: 'كبسة' });
      const planId = await seedPlan('ar', [id]);
      const service = new RecipeTranslationService(
        ctx.db as never,
        gatewayReturning({ titles: ['Kabsa'] }),
      );

      await expect(service.warmPlanTitles(householdId, planId)).resolves.toBe(1);
      expect((await readRecipe(id)).titleEn).toBe('Kabsa');
    });

    /**
     * The response is mapped back onto recipes by position, so a list of the
     * wrong length would label dishes with each other's names. Discarding is the
     * only safe answer.
     */
    it('discards a response whose length does not match the request', async () => {
      const first = await seedRecipe({ titleAr: 'ملوخية' });
      const second = await seedRecipe({ titleAr: 'مقلوبة' });
      const planId = await seedPlan('ar', [first, second]);
      const service = new RecipeTranslationService(
        ctx.db as never,
        gatewayReturning({ titles: ['Molokhia'] }),
      );

      await expect(service.warmPlanTitles(householdId, planId)).resolves.toBe(0);
      expect((await readRecipe(first)).titleEn).toBeNull();
      expect((await readRecipe(second)).titleEn).toBeNull();
    });

    /** A weekly plan repeats dishes; the same name must not be paid for twice. */
    it('asks once for a dish that repeats across the plan', async () => {
      const first = await seedRecipe({ titleAr: 'شوربة عدس' });
      const second = await seedRecipe({ titleAr: 'شوربة عدس' });
      const planId = await seedPlan('ar', [first, second]);
      const gateway = gatewayReturning({ titles: ['Lentil soup'] });
      const service = new RecipeTranslationService(ctx.db as never, gateway);

      await expect(service.warmPlanTitles(householdId, planId)).resolves.toBe(2);
      expect((gateway.calls[0] as { titles: string[] }).titles).toEqual(['شوربة عدس']);
      expect((await readRecipe(second)).titleEn).toBe('Lentil soup');
    });

    it('does nothing when every dish already has both names', async () => {
      const id = await seedRecipe({ titleAr: 'تبولة', titleEn: 'Tabbouleh' });
      const planId = await seedPlan('ar', [id]);
      const gateway = gatewayReturning({ titles: ['x'] });

      await expect(
        new RecipeTranslationService(ctx.db as never, gateway).warmPlanTitles(householdId, planId),
      ).resolves.toBe(0);
      expect(gateway.calls).toHaveLength(0);
    });
  });
});
