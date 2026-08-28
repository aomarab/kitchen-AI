import { randomUUID } from 'node:crypto';
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
import { CreditsService } from '../../credits/credits.service.js';
import { PANTRY_PORT } from '../ai.constants.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import { cloneSnapshot, consumeFromSnapshot } from '../planner/pantry-snapshot.js';
import { runInBillingContext } from '../usage/billing-context.js';
import { validateRecipe } from '../planner/validation.js';
import type { CatalogIngredientRef, ResolvedRecipe } from '../planner/types.js';
import { toRecipeSummary, type RecipeRow, type ResolvedMedia } from '../recipes/recipe-mapper.js';
import { MediaService } from '../recipes/media.service.js';
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

/** The language a dish's artwork falls back to when the reader's has none. */
const otherLocale = (locale: Locale): Locale => (locale === 'ar' ? 'en' : 'ar');

@Injectable()
export class PlanService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PANTRY_PORT) private readonly pantry: PantryPort,
    @Inject(PlannerService) private readonly planner: PlannerService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  /**
   * Refuse to plan from an empty kitchen, before any credit is spent.
   *
   * Stage A (spec §5) reads the pantry; with nothing in it stage C can only
   * report every ingredient of every candidate as a shortfall, so a weekly plan
   * comes back fully generated and zero percent covered — a shopping list
   * wearing a meal plan's clothes, which the household paid AI credits for. The
   * product's promise is a plan grounded in what you actually have, so the
   * honest answer is to ask for some items first rather than bill for a plan
   * that ignores the pantry entirely.
   *
   * Staples are deliberately not counted: a kitchen holding only implicit salt
   * and oil still cannot cook anything.
   */
  async assertPantryStocked(householdId: string): Promise<void> {
    const snapshot = await this.pantry.snapshot(householdId);
    if (snapshot.byIngredientId.size === 0) {
      throw new AppError('PLAN_INFEASIBLE', 'errors.emptyPantry');
    }
  }

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
    const media = await this.mediaFor(
      rows.flatMap((row) =>
        row.entries.map((entry) => ({ entry, locale: this.readingLocale(row, query.locale) })),
      ),
    );
    return rows.map((row) => this.toMealPlan(row, media, query.locale));
  }

  async get(householdId: string, id: string, requested?: Locale): Promise<MealPlan> {
    const row = await this.loadPlan(householdId, id);
    const locale = this.readingLocale(row, requested);
    return this.toMealPlan(
      row,
      await this.mediaFor(row.entries.map((entry) => ({ entry, locale }))),
      requested,
    );
  }

  /**
   * The language to render a plan in.
   *
   * A plan is generated in one language and then read in whichever the reader
   * has chosen, which are not the same thing — defaulting to the plan's own
   * language left a household that switched to English staring at Arabic. The
   * reader's choice wins; the plan's language is only the fallback for a client
   * that did not say.
   */
  private readingLocale(row: { locale: string | null }, requested?: Locale): Locale {
    return requested ?? (row.locale as Locale) ?? 'en';
  }

  /**
   * One cached read for every dish on the board. A plan screen is a wall of
   * recipes, so resolving them individually would be a search per tile; this
   * only reads what the recipe screen has already resolved, which is why it
   * never spends quota and never blocks the list on YouTube.
   */
  private async mediaFor(
    entries: readonly { entry: EntryWithRecipe; locale: Locale }[],
  ): Promise<Map<string, ResolvedMedia>> {
    const candidates = new Map<string, { locale: Locale; key: string }[]>();
    const wanted = new Map<Locale, Set<string>>();

    for (const { entry, locale } of entries) {
      // The reader's language first, then the other one. Artwork is cached
      // against a dish *and* a language, but a photo of shakshuka is the same
      // photo in either — so a plan generated in Arabic and read in English
      // matched nothing and drew a board of placeholders. Videos are genuinely
      // language-specific, which is why only the image is shared here.
      const options: { locale: Locale; key: string }[] = [];
      for (const candidate of [locale, otherLocale(locale)]) {
        const title = candidate === 'ar' ? entry.recipe.titleAr : entry.recipe.titleEn;
        if (!title) continue;
        const key = this.media.keyFor(title, candidate);
        options.push({ locale: candidate, key });
        const keys = wanted.get(candidate) ?? new Set<string>();
        keys.add(key);
        wanted.set(candidate, keys);
      }
      if (options.length > 0) candidates.set(entry.recipe.id, options);
    }

    const found = new Map<Locale, Awaited<ReturnType<MediaService['lookupMany']>>>();
    await Promise.all(
      [...wanted].map(async ([locale, keys]) => {
        found.set(locale, await this.media.lookupMany([...keys], locale));
      }),
    );

    const resolved = new Map<string, ResolvedMedia>();
    for (const [recipeId, options] of candidates) {
      for (const option of options) {
        const hit = found.get(option.locale)?.get(option.key);
        if (!hit?.heroThumbnailUrl) continue;
        resolved.set(recipeId, { heroThumbnailUrl: hit.heroThumbnailUrl, videos: [] });
        break;
      }
    }

    return resolved;
  }

  /**
   * Resolves media for every dish on a freshly generated plan.
   *
   * {@link mediaFor} is read-only, so without this a new plan opens as a wall of
   * placeholders until each recipe is opened individually. Generation is
   * already an asynchronous job, so it is the only place that can pay for the
   * searches without a screen waiting on them.
   *
   * Returns the number warmed rather than throwing: the plan is saved and paid
   * for by the time this runs, and a YouTube outage must not cost the user
   * their plan.
   */
  async warmMedia(householdId: string, id: string): Promise<number> {
    const row = await this.loadPlan(householdId, id);
    const locale = (row.locale as Locale) ?? 'en';

    const dishes = row.entries
      .map((entry) => (locale === 'ar' ? entry.recipe.titleAr : entry.recipe.titleEn))
      .filter((title): title is string => Boolean(title))
      .map((title) => ({ title, locale }));

    return this.media.warm(dishes);
  }

  async remove(householdId: string, id: string): Promise<{ ok: true }> {
    await this.loadPlan(householdId, id);
    await this.db.delete(mealPlans).where(eq(mealPlans.id, id));
    return { ok: true };
  }

  async coverage(householdId: string, id: string): Promise<PlanCoverage> {
    const plan = await this.db.query.mealPlans.findFirst({
      where: and(eq(mealPlans.id, id), eq(mealPlans.householdId, householdId)),
      with: {
        entries: { with: { recipe: { with: { ingredients: { with: { ingredient: true } } } } } },
      },
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
    await this.credits.assertCanAfford(householdId, 'plan.regenerateEntry');
    const existing = await this.loadEntryRow(planId, entryId);

    // Minted here so the generation below is recorded against the spend that
    // follows it, rather than as anonymous usage.
    const spendGroupId = randomUUID();
    const { recipeId, fullyCovered } = await runInBillingContext(
      { spendGroupId, action: 'plan.regenerateEntry' },
      () =>
        this.planner.regenerateEntry({
          householdId,
          userId,
          date: existing.date,
          slot: existing.slot,
          excludeRecipeIds: [existing.recipeId, ...body.excludeRecipeIds],
          ...(body.note ? { note: body.note } : {}),
          ...(scenario ? { scenario } : {}),
        }),
    );

    await this.db
      .update(mealPlanEntries)
      .set({ recipeId, fullyCovered })
      .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlanEntries.planId, planId)));

    await this.credits.spend(householdId, 'plan.regenerateEntry', { spendGroupId });
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
    return this.toEntry({ ...row, recipe: row.recipe as RecipeRow }, locale);
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
  }, media: Map<string, ResolvedMedia>, requested?: Locale): MealPlan {
    const locale = this.readingLocale(row, requested);
    const entries = [...row.entries]
      .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
      .map((e) => this.toEntry(e, locale, media));
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

  private toEntry(
    row: EntryWithRecipe,
    locale: Locale,
    media?: Map<string, ResolvedMedia>,
  ): MealPlanEntry {
    return {
      id: row.id,
      planId: row.planId,
      date: row.date,
      slot: row.slot,
      recipe: toRecipeSummary(row.recipe, locale, media?.get(row.recipe.id)),
      servings: row.servings,
      state: row.state,
      fullyCovered: row.fullyCovered,
    };
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
