import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import {
  DEFAULT_SLOTS_BY_SCOPE,
  MAX_RECIPE_REPEATS_PER_WEEK,
  generatedPlanSchema,
  type GeneratePlanRequest,
  type GeneratedPlan,
  type Locale,
  type MealSlot,
} from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { AppError } from '../../common/errors.js';
import {
  mealPlanEntries,
  mealPlans,
  profiles,
  recipeIngredients,
  recipes,
  shoppingListItems,
  users,
} from '../../db/schema.js';
import { AiGateway } from '../ai-gateway.service.js';
import { CATALOG_PORT, PANTRY_PORT, RESPONSE_CACHE } from '../ai.constants.js';
import type { IngredientResolverPort } from '../catalog/ingredient-resolver.port.js';
import type { PantryPort } from './pantry-snapshot.js';
import { pantryLinesByExpiry } from './pantry-snapshot.js';
import { fromBase } from './units.js';
import { lastDate, planWeeks } from './date-range.js';
import { runPlanner, type PlanCoreEntry, type PlanCoreResult } from './planner-core.js';
import { validateRecipe } from './validation.js';
import type { ResolvedRecipeIngredient } from './types.js';
import { buildPlanningPrompt } from '../prompts/planning.prompt.js';
import type { PlanConstraints, PlanPromptContext } from '../prompts/prompt.types.js';
import { hashKey, type ResponseCachePort } from '../cache/response-cache.js';

export interface PlanGenerationInput {
  householdId: string;
  userId: string;
  request: GeneratePlanRequest;
  /** Fixture selector forwarded to the mock provider (tests only). */
  scenario?: string;
}

interface ResolvedProfile {
  dietaryPrefs: string[];
  allergies: string[];
  halal: boolean;
  cuisinePrefs: string[];
  householdSize: number;
  locale: Locale;
}

/**
 * The three-stage meal planner (spec §5.4). Stage A builds the deterministic
 * pantry snapshot, Stage B generates recipes via the LLM (through the cost/
 * validation gateway), Stage C validates and forward-simulates in
 * {@link runPlanner}. The result is persisted as a meal plan with entries,
 * recipes and — for weekly/monthly — shopping-list items for the shortfalls.
 */
@Injectable()
export class PlannerService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PANTRY_PORT) private readonly pantry: PantryPort,
    @Inject(CATALOG_PORT) private readonly catalog: IngredientResolverPort,
    @Inject(RESPONSE_CACHE) private readonly cache: ResponseCachePort,
    @Inject(AiGateway) private readonly gateway: AiGateway,
  ) {}

  async generate(input: PlanGenerationInput): Promise<string> {
    const { householdId, request } = input;
    const profile = await this.loadProfile(input.userId);

    const scope = request.scope;
    const slots = request.slots ?? DEFAULT_SLOTS_BY_SCOPE[scope];
    const servings = request.servings ?? profile.householdSize;
    const locale = request.locale ?? profile.locale;
    const cuisinePrefs = request.cuisinePrefs ?? profile.cuisinePrefs;
    const excludeNames = await this.resolveExcludeNames(request.excludeIngredientIds ?? []);

    const constraints: PlanConstraints = {
      dietaryPrefs: profile.dietaryPrefs,
      allergies: profile.allergies,
      halal: profile.halal,
      cuisinePrefs,
      householdSize: profile.householdSize,
      maxCookMinutes: request.maxCookMinutes ?? null,
      excludeNames,
    };

    const snapshot = await this.pantry.snapshot(householdId);
    const weeks = planWeeks(request.startsOn, scope);

    const signature = [...snapshot.byIngredientId.values()]
      .map((e) => [e.ingredientId, Math.round(e.baseQuantity)] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const cacheKey = hashKey('plan', {
      // Scoped to the household. Without it, two households whose pantries
      // hash the same share a plan — and the second one is served from cache,
      // skipping the ai_usage row that enforces its own daily budget.
      householdId,
      scope,
      startsOn: request.startsOn,
      slots,
      servings,
      locale,
      constraints,
      signature,
      scenario: input.scenario ?? null,
    });

    let result = await this.cache.get<PlanCoreResult>(cacheKey);
    if (!result) {
      result = await runPlanner({
        scope,
        weeks,
        slots,
        constraints: { allergies: profile.allergies, halal: profile.halal },
        maxDailyRetries: 2,
        baseSnapshot: snapshot,
        generate: ({ dates, slots: weekSlots, snapshot: working, alreadyUsedTitles }) =>
          this.stageB({
            householdId,
            locale,
            scope,
            servings,
            constraints,
            dates,
            slots: weekSlots,
            snapshot: working,
            alreadyUsedTitles,
            scenario: input.scenario,
          }),
        resolve: (names) =>
          this.catalog.resolve(
            names.map((name) => ({ name })),
            { createIfMissing: true },
          ),
      });
      await this.cache.set(cacheKey, result, 60 * 30);
    }

    return this.persist({ householdId, request, locale, scope, servings, slots, result });
  }

  /**
   * Regenerates a single plan entry (spec §6.2 recipe swap). Produces one new
   * recipe for the entry's date/slot, avoiding the excluded recipes, validated
   * against the current pantry, and persists it. Returns the new recipe id.
   */
  async regenerateEntry(params: {
    householdId: string;
    userId: string;
    date: string;
    slot: MealSlot;
    excludeRecipeIds: string[];
    note?: string;
    scenario?: string;
  }): Promise<{ recipeId: string; servings: number; fullyCovered: boolean }> {
    const profile = await this.loadProfile(params.userId);
    const servings = profile.householdSize;
    const snapshot = await this.pantry.snapshot(params.householdId);
    const excludeTitles = await this.recipeTitles(params.excludeRecipeIds);

    const constraints: PlanConstraints = {
      dietaryPrefs: profile.dietaryPrefs,
      allergies: profile.allergies,
      halal: profile.halal,
      cuisinePrefs: profile.cuisinePrefs,
      householdSize: profile.householdSize,
      maxCookMinutes: null,
      excludeNames: [],
    };

    const plan = await this.stageB({
      householdId: params.householdId,
      locale: profile.locale,
      scope: 'daily',
      servings,
      constraints,
      dates: [params.date],
      slots: [params.slot],
      snapshot,
      alreadyUsedTitles: excludeTitles,
      scenario: params.scenario,
      ...(params.note ? { note: params.note } : {}),
    });

    const gen =
      plan.entries.find((e) => e.date === params.date && e.slot === params.slot) ?? plan.entries[0];
    if (!gen) throw new AppError('AI_NO_RESULT');

    const names = [...new Set(gen.recipe.ingredients.map((i) => i.name))];
    const resolvedNames = await this.catalog.resolve(
      names.map((name) => ({ name })),
      { createIfMissing: true },
    );
    const byName = new Map(resolvedNames.map((r) => [r.rawName.trim().toLowerCase(), r]));

    const resolved: ResolvedRecipeIngredient[] = gen.recipe.ingredients.map((i) => ({
      rawName: i.name,
      ingredient: byName.get(i.name.trim().toLowerCase())?.ingredient ?? null,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
    }));

    const validation = validateRecipe(
      { title: gen.recipe.title, ingredients: resolved },
      snapshot,
      { allergies: profile.allergies, halal: profile.halal },
    );
    if (!validation.safe) throw new AppError('AI_NO_RESULT');

    const entry: PlanCoreEntry = { date: params.date, slot: params.slot, recipe: gen.recipe, resolved, validation };
    const recipeId = await this.db.transaction((tx) =>
      this.insertRecipe(tx, params.householdId, profile.locale, entry),
    );
    return { recipeId, servings, fullyCovered: validation.fullyCovered };
  }

  private async recipeTitles(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ titleEn: recipes.titleEn, titleAr: recipes.titleAr })
      .from(recipes)
      .where(inArray(recipes.id, ids));
    return rows.flatMap((r) => [r.titleEn, r.titleAr].filter((t): t is string => !!t));
  }

  private async stageB(params: {
    householdId: string;
    locale: Locale;
    scope: GeneratePlanRequest['scope'];
    servings: number;
    constraints: PlanConstraints;
    dates: string[];
    slots: MealSlot[];
    snapshot: Awaited<ReturnType<PantryPort['snapshot']>>;
    alreadyUsedTitles: string[];
    scenario?: string;
    note?: string;
  }): Promise<GeneratedPlan> {
    const pantry = pantryLinesByExpiry(params.snapshot).map((e) => ({
      name: params.locale === 'ar' ? e.nameAr : e.nameEn,
      nameEn: e.nameEn,
      nameAr: e.nameAr,
      quantity: Math.round(fromBase(e.baseQuantity, e.displayUnit) * 100) / 100,
      unit: e.displayUnit,
      expiresOn: e.expiresOn,
      isStaple: e.isStaple,
    }));

    const ctx: PlanPromptContext = {
      locale: params.locale,
      scope: params.scope,
      dates: params.dates,
      slots: params.slots,
      servings: params.servings,
      constraints: params.constraints,
      pantry,
      maxRepeatsPerWeek: MAX_RECIPE_REPEATS_PER_WEEK,
      alreadyUsedTitles: params.alreadyUsedTitles,
      ...(params.note ? { note: params.note } : {}),
    };

    return this.gateway.execute<GeneratedPlan>({
      householdId: params.householdId,
      operation: 'plan.generate',
      prompt: buildPlanningPrompt(ctx),
      schema: generatedPlanSchema,
      context: ctx,
      scenario: params.scenario,
    });
  }

  private async loadProfile(userId: string): Promise<ResolvedProfile> {
    const [profileRow] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    const [userRow] = await this.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      dietaryPrefs: profileRow?.dietaryPrefs ?? [],
      allergies: profileRow?.allergies ?? [],
      halal: profileRow?.halal ?? false,
      cuisinePrefs: profileRow?.cuisinePrefs ?? [],
      householdSize: profileRow?.householdSize ?? 2,
      locale: (userRow?.locale as Locale | undefined) ?? 'en',
    };
  }

  private async resolveExcludeNames(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const map = await this.catalog.findByIds(ids);
    const names: string[] = [];
    for (const ref of map.values()) {
      names.push(ref.canonicalNameEn, ref.canonicalNameAr);
    }
    return names;
  }

  private async persist(params: {
    householdId: string;
    request: GeneratePlanRequest;
    locale: Locale;
    scope: GeneratePlanRequest['scope'];
    servings: number;
    slots: MealSlot[];
    result: PlanCoreResult;
  }): Promise<string> {
    const { householdId, request, locale, scope, servings, slots, result } = params;

    return this.db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(mealPlans)
        .values({
          householdId,
          scope,
          startsOn: request.startsOn,
          endsOn: lastDate(request.startsOn, scope),
          status: 'ready',
          locale,
          generationParams: { slots, servings, locale, scope },
        })
        .returning({ id: mealPlans.id });
      const planId = plan!.id;

      let position = 0;
      for (const entry of result.entries) {
        const recipeId = await this.insertRecipe(tx, householdId, locale, entry);
        await tx.insert(mealPlanEntries).values({
          planId,
          date: entry.date,
          slot: entry.slot,
          recipeId,
          servings,
          state: 'planned',
          position: position++,
          fullyCovered: entry.validation.fullyCovered,
        });
      }

      if (scope !== 'daily') {
        for (const sf of result.shoppingShortfalls) {
          if (!sf.ingredientId) continue;
          await tx.insert(shoppingListItems).values({
            householdId,
            planId,
            ingredientId: sf.ingredientId,
            quantity: sf.shortfall.toFixed(3),
            unit: sf.unit,
            purchased: false,
          });
        }
      }

      return planId;
    });
  }

  private async insertRecipe(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    householdId: string,
    locale: Locale,
    entry: PlanCoreEntry,
  ): Promise<string> {
    const recipe = entry.recipe;
    const steps = recipe.steps.map((text, i) => ({ index: i + 1, text, durationMinutes: null }));

    const [inserted] = await tx
      .insert(recipes)
      .values({
        householdId,
        titleEn: locale === 'en' ? recipe.title : null,
        titleAr: locale === 'ar' ? recipe.title : null,
        descriptionEn: locale === 'en' ? recipe.description : null,
        descriptionAr: locale === 'ar' ? recipe.description : null,
        stepsEn: locale === 'en' ? steps : null,
        stepsAr: locale === 'ar' ? steps : null,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        servings: recipe.servings,
        difficulty: recipe.difficulty,
        cuisine: recipe.cuisine,
        nutrition: recipe.nutritionPerServing ?? null,
        generatedBy: 'ai',
      })
      .returning({ id: recipes.id });
    const recipeId = inserted!.id;

    const rows = entry.resolved
      .filter((ing) => ing.ingredient)
      .map((ing) => ({
        recipeId,
        ingredientId: ing.ingredient!.id,
        quantity: ing.quantity.toFixed(3),
        unit: ing.unit,
        optional: ing.optional,
        note: null,
      }));
    if (rows.length > 0) await tx.insert(recipeIngredients).values(rows);

    return recipeId;
  }
}
