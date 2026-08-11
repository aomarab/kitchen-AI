import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CoverageShortfall,
  ListPlansQuery,
  Locale,
  MealPlan,
  MealPlanEntry,
  PlanCoverage,
  RegenerateEntryRequest,
  UpdateEntryRequest,
} from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import { DB, type Database } from '../../db/index.js';
import { mealPlanEntries, mealPlans } from '../../db/schema.js';
import { PANTRY_PORT } from '../ai.constants.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import { cloneSnapshot, consumeFromSnapshot } from '../planner/pantry-snapshot.js';
import { validateRecipe } from '../planner/validation.js';
import type { CatalogIngredientRef, ResolvedRecipe } from '../planner/types.js';
import { toRecipeSummary, type RecipeRow } from '../recipes/recipe-mapper.js';
import { dishKey } from '../recipes/dish-key.js';
import type { DishMedia } from '../recipes/media.service.js';
import { MediaService, NO_MEDIA } from '../recipes/media.service.js';
import { PlannerService } from '../planner/planner.service.js';

type EntryWithRecipe = {
  id: string;
  planId: string;
  date: string;
  slot: MealPlanEntry['slot'];
  servings: number;
  state: MealPlanEntry['state'];
  fullyCovered: boolean;
  position: number;
  recipe: RecipeRow;
};

@Injectable()
export class PlanService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PANTRY_PORT) private readonly pantry: PantryPort,
    @Inject(PlannerService) private readonly planner: PlannerService,
    private readonly mediaService: MediaService,
  ) {}

  async list(householdId: string, query: ListPlansQuery): Promise<MealPlan[]> {
    const filters = [eq(mealPlans.householdId, householdId)];
    if (query.scope) filters.push(eq(mealPlans.scope, query.scope));
    if (query.status) filters.push(eq(mealPlans.status, query.status));
    if (query.on) {
      filters.push(lte(mealPlans.startsOn, query.on));
      filters.push(gte(mealPlans.endsOn, query.on));
    }

    const rows = await this.db.query.mealPlans.findMany({
      where: and(...filters),
      orderBy: [desc(mealPlans.startsOn)],
      with: { entries: { with: { recipe: true } } },
    });
    const locale = (rows[0]?.locale as Locale | undefined) ?? 'en';
    const mediaMap = await this.resolveMediaForPlans(rows as Parameters<typeof this.toMealPlan>[0][], locale);
    return rows.map((row) => this.toMealPlan(row as Parameters<typeof this.toMealPlan>[0], mediaMap));
  }

  async get(householdId: string, id: string): Promise<MealPlan> {
    const row = await this.loadPlan(householdId, id);
    const locale = (row.locale as Locale) ?? 'en';
    const mediaMap = await this.resolveMediaForPlans([row], locale);
    return this.toMealPlan(row, mediaMap);
  }

  async remove(householdId: string, id: string): Promise<{ ok: true }> {
    await this.loadPlan(householdId, id);
    await this.db.delete(mealPlans).where(eq(mealPlans.id, id));
    return { ok: true };
  }

  async coverage(householdId: string, id: string): Promise<PlanCoverage> {
    const plan = await this.db.query.mealPlans.findFirst({
      where: and(eq(mealPlans.id, id), eq(mealPlans.householdId, householdId)),
      with: { entries: { with: { recipe: { with: { ingredients: { with: { ingredient: true } } } } } } },
    });
    if (!plan) throw AppError.notFound('errors.NOT_FOUND');

    // Forward-simulated, exactly as the planner does when it builds the plan.
    // Validating every entry against the same pristine snapshot double-counts
    // shared stock: two meals that each need the whole bag of rice would both
    // report as covered, and the shopping list would miss the second bag.
    // `position` is assigned in the order the planner accepted entries, so
    // replaying in that order reproduces its arithmetic.
    const snapshot = await this.pantry.snapshot(householdId);
    const working = cloneSnapshot(snapshot);
    const covered: string[] = [];
    const uncovered: string[] = [];
    const shortfallMap = new Map<string, CoverageShortfall>();

    for (const entry of inPlannerOrder(plan.entries)) {
      const resolved: ResolvedRecipe = {
        title: entry.recipe.titleEn ?? entry.recipe.titleAr ?? '',
        ingredients: entry.recipe.ingredients.map((ri) => ({
          rawName: ri.ingredient.canonicalNameEn,
          ingredient: toRef(ri.ingredient),
          quantity: Number(ri.quantity),
          unit: ri.unit,
          optional: ri.optional,
        })),
      };
      const validation = validateRecipe(resolved, working, { allergies: [], halal: false });
      if (validation.fullyCovered) covered.push(entry.id);
      else uncovered.push(entry.id);
      consumeFromSnapshot(working, resolved.ingredients);

      for (const sf of validation.shortfalls) {
        if (!sf.ingredientId) continue;
        const key = `${sf.ingredientId}:${sf.unit}`;
        const existing = shortfallMap.get(key);
        if (existing) {
          existing.required += sf.required;
          existing.shortfall += sf.shortfall;
        } else {
          shortfallMap.set(key, {
            ingredientId: sf.ingredientId,
            nameEn: sf.nameEn,
            nameAr: sf.nameAr,
            required: sf.required,
            available: sf.available,
            shortfall: sf.shortfall,
            unit: sf.unit,
          });
        }
      }
    }

    const total = plan.entries.length;
    const expiringSoon = [...snapshot.byIngredientId.values()]
      .filter((e) => e.expiresOn != null && e.expiresOn <= plan.endsOn)
      .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''))
      .map((e) => e.ingredientId);

    return {
      planId: id,
      coverageRatio: total === 0 ? 1 : covered.length / total,
      coveredEntryIds: covered,
      uncoveredEntryIds: uncovered,
      shortfalls: [...shortfallMap.values()],
      expiringSoonIngredientIds: expiringSoon,
    };
  }

  async updateEntry(
    householdId: string,
    planId: string,
    entryId: string,
    body: UpdateEntryRequest,
  ): Promise<MealPlanEntry> {
    await this.loadPlan(householdId, planId);
    const patch: Record<string, unknown> = {};
    if (body.date !== undefined) patch.date = body.date;
    if (body.slot !== undefined) patch.slot = body.slot;
    if (body.servings !== undefined) patch.servings = body.servings;
    if (body.state !== undefined) patch.state = body.state;

    if (Object.keys(patch).length > 0) {
      try {
        await this.db
          .update(mealPlanEntries)
          .set(patch)
          .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.planId, planId)));
      } catch {
        throw AppError.conflict('errors.CONFLICT');
      }
    }
    return this.loadEntry(planId, entryId);
  }

  async regenerateEntry(
    householdId: string,
    userId: string,
    planId: string,
    entryId: string,
    body: RegenerateEntryRequest,
    scenario?: string,
  ): Promise<MealPlanEntry> {
    await this.loadPlan(householdId, planId);
    const existing = await this.loadEntryRow(planId, entryId);

    const { recipeId, fullyCovered } = await this.planner.regenerateEntry({
      householdId,
      userId,
      date: existing.date,
      slot: existing.slot,
      excludeRecipeIds: [existing.recipeId, ...body.excludeRecipeIds],
      ...(body.note ? { note: body.note } : {}),
      ...(scenario ? { scenario } : {}),
    });

    await this.db
      .update(mealPlanEntries)
      .set({ recipeId, fullyCovered })
      .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.planId, planId)));
    return this.loadEntry(planId, entryId);
  }

  private async loadPlan(householdId: string, id: string) {
    const row = await this.db.query.mealPlans.findFirst({
      where: and(eq(mealPlans.id, id), eq(mealPlans.householdId, householdId)),
      with: { entries: { with: { recipe: true } } },
    });
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    return row;
  }

  private async loadEntryRow(planId: string, entryId: string) {
    const [row] = await this.db
      .select()
      .from(mealPlanEntries)
      .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.planId, planId)))
      .limit(1);
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    return row;
  }

  private async loadEntry(planId: string, entryId: string): Promise<MealPlanEntry> {
    const row = await this.db.query.mealPlanEntries.findFirst({
      where: and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.planId, planId)),
      with: { recipe: true, plan: true },
    });
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    const locale = (row.plan.locale as Locale) ?? 'en';
    const recipe = row.recipe as RecipeRow;
    const title = locale === 'ar' ? (recipe.titleAr ?? recipe.titleEn ?? '') : (recipe.titleEn ?? recipe.titleAr ?? '');
    const dishMediaResult = await this.mediaService.resolve(title, locale);
    const mediaMap = new Map([[dishKey(title), dishMediaResult]]);
    return this.toEntry({ ...row, recipe }, locale, mediaMap);
  }

  private toMealPlan(row: {
    id: string;
    householdId: string;
    scope: MealPlan['scope'];
    startsOn: string;
    endsOn: string;
    status: MealPlan['status'];
    locale: string;
    createdAt: Date;
    entries: EntryWithRecipe[];
  }, mediaMap: Map<string, DishMedia> = new Map()): MealPlan {
    const locale = (row.locale as Locale) ?? 'en';
    const entries = [...row.entries]
      .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
      .map((e) => this.toEntry(e, locale, mediaMap));
    return {
      id: row.id,
      householdId: row.householdId,
      scope: row.scope,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      status: row.status,
      locale,
      entries,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toEntry(row: EntryWithRecipe, locale: Locale, mediaMap: Map<string, DishMedia>): MealPlanEntry {
    const title = locale === 'ar' ? (row.recipe.titleAr ?? row.recipe.titleEn ?? '') : (row.recipe.titleEn ?? row.recipe.titleAr ?? '');
    const media = mediaMap.get(dishKey(title)) ?? NO_MEDIA;
    return {
      id: row.id,
      planId: row.planId,
      date: row.date,
      slot: row.slot,
      recipe: toRecipeSummary(row.recipe, locale, media),
      servings: row.servings,
      state: row.state,
      fullyCovered: row.fullyCovered,
    };
  }

  private async resolveMediaForPlans(
    rows: { locale: string; entries: EntryWithRecipe[] }[],
    locale: Locale,
  ): Promise<Map<string, DishMedia>> {
    const requests: { title: string; locale: Locale }[] = [];
    for (const row of rows) {
      const l = (row.locale as Locale) ?? locale;
      for (const e of row.entries) {
        const title = l === 'ar' ? (e.recipe.titleAr ?? e.recipe.titleEn ?? '') : (e.recipe.titleEn ?? e.recipe.titleAr ?? '');
        if (title) requests.push({ title, locale: l });
      }
    }
    return this.mediaService.resolveMany(requests);
  }
}

function toRef(ingredient: {
  id: string;
  canonicalNameEn: string;
  canonicalNameAr: string;
  category: CatalogIngredientRef['category'];
  defaultUnit: CatalogIngredientRef['defaultUnit'];
  aliases: string[];
  isStaple: boolean;
}): CatalogIngredientRef {
  return {
    id: ingredient.id,
    canonicalNameEn: ingredient.canonicalNameEn,
    canonicalNameAr: ingredient.canonicalNameAr,
    aliases: ingredient.aliases ?? [],
    category: ingredient.category,
    defaultUnit: ingredient.defaultUnit,
    isStaple: ingredient.isStaple,
  };
}

/**
 * The order the planner accepted entries in, and therefore the order it spent
 * the pantry in. `position` is assigned as each entry is committed, so the
 * (date, position) sort used for display is the same sequence.
 */
function inPlannerOrder<T extends { date: string; position: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
}
