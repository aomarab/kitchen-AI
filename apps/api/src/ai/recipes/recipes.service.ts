import { and, eq, inArray, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type {
  Locale,
  MarkCookedRequest,
  MarkCookedResponse,
  Recipe,
  RecipeVideo,
  Unit,
} from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import { DB, type Database } from '../../db/index.js';
import { numeric } from '../../common/serialization.js';
import {
  inventoryEvents,
  inventoryItems,
  mealPlanEntries,
  mealPlans,
  recipes,
  users,
} from '../../db/schema.js';
import { PANTRY_PORT } from '../ai.constants.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import { convert } from '../planner/units.js';
import { MediaService, type DishMedia } from './media.service.js';
import { toRecipe, type FullRecipeRow, type ResolvedMedia } from './recipe-mapper.js';
import { RecipeTranslationService } from './translation.service.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class RecipesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PANTRY_PORT) private readonly pantry: PantryPort,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(RecipeTranslationService) private readonly translation: RecipeTranslationService,
  ) {}

  /**
   * Opening a recipe is where media gets resolved. Both the hero image and the
   * videos come from the one matched dish, so the screen the user is actually
   * looking at fills in from a single call — and the resolved dish is then free
   * for every other household that generates it.
   */
  async getRecipe(householdId: string, id: string, requested?: Locale): Promise<Recipe> {
    let row = await this.loadRecipe(householdId, id);
    const locale = requested ?? (row.titleEn ? 'en' : 'ar');

    // Opening a recipe is the moment its body is worth translating: it is one
    // recipe, someone is reading it now, and the result is cached for good.
    // Re-read rather than trusting the write, so the screen shows what was
    // actually stored.
    if (await this.translation.ensureRecipe(householdId, id, locale)) {
      row = await this.loadRecipe(householdId, id);
    }
    const [snapshot, media] = await Promise.all([
      this.pantry.snapshot(householdId),
      this.resolveMedia(row, locale),
    ]);
    return toRecipe(row, locale, snapshot, media);
  }

  /**
   * Recipe videos (spec §5.5). Delegates to the dish-level cache, so this and
   * the hero image are always the same verified match. Ids always come from the
   * YouTube API, never the LLM.
   */
  async getVideos(householdId: string, id: string, requested?: Locale): Promise<RecipeVideo[]> {
    const row = await this.loadRecipe(householdId, id);
    const locale = requested ?? (row.titleEn ? 'en' : 'ar');
    return (await this.resolveMedia(row, locale)).videos;
  }

  private async resolveMedia(row: FullRecipeRow, locale: Locale): Promise<ResolvedMedia> {
    const title =
      locale === 'ar' ? row.titleAr ?? row.titleEn ?? '' : row.titleEn ?? row.titleAr ?? '';
    if (title.trim().length === 0) return { heroThumbnailUrl: null, videos: [] };

    const resolved = await this.media.resolve(this.media.keyFor(title, locale), title, locale);
    return toResolvedMedia(resolved, locale);
  }

  /**
   * Marks a recipe cooked and deducts its ingredients from inventory (spec §4.2).
   *
   * The whole thing runs in one transaction. Deduction is a read-then-write —
   * how much to take from each item depends on what that item currently holds —
   * so the rows are locked while the arithmetic happens. Without that, a
   * concurrent offline sync landing between the read and the write is silently
   * overwritten, and `sum(inventory_events.delta)` stops matching the quantity
   * the ledger is supposed to explain. The plan entry flips to `cooked` in the
   * same transaction, so a failure can never leave stock deducted for a meal
   * that still shows as planned.
   */
  async markCooked(
    householdId: string,
    userId: string,
    id: string,
    request: MarkCookedRequest,
  ): Promise<MarkCookedResponse> {
    const row = await this.loadRecipe(householdId, id);
    const scale = (request.servings ?? row.servings) / (row.servings || 1);

    // `mealPlanEntryId` is client-supplied. It is stamped onto every
    // inventory_event below and flipped to `cooked` at the end, so it has to be
    // proved to belong to this household before either write happens.
    if (request.mealPlanEntryId) {
      await this.requireOwnedPlanEntry(householdId, request.mealPlanEntryId);
    }

    return this.db.transaction(async (tx) => {
      const deductedItemIds: string[] = [];
      const missingIngredientIds: string[] = [];

      if (request.deductInventory) {
        const deductable = row.ingredients.filter(
          (ing) => !ing.optional && !ing.ingredient.isStaple,
        );

        // Take every row lock up front, ordered by primary key. The per-
        // ingredient FOR UPDATE below would otherwise acquire locks in
        // whatever order the relational load happened to return ingredients,
        // which is per-recipe and arbitrary: two recipes sharing two
        // ingredients, cooked concurrently, could each hold the lock the other
        // is waiting for. `sync` locks the same table in the order the client
        // sent its events, so it could deadlock against this too. A single
        // canonical ordering, applied by both, removes the cycle.
        if (deductable.length > 0) {
          await tx
            .select({ id: inventoryItems.id })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.householdId, householdId),
                inArray(
                  inventoryItems.ingredientId,
                  deductable.map((ing) => ing.ingredient.id),
                ),
              ),
            )
            .orderBy(inventoryItems.id)
            .for('update');
        }

        for (const ing of deductable) {
          const need = Number(ing.quantity) * scale;
          const done = await this.deductIngredient(
            tx,
            householdId,
            userId,
            ing.ingredient.id,
            need,
            ing.unit,
            request.mealPlanEntryId,
            deductedItemIds,
          );
          if (!done) missingIngredientIds.push(ing.ingredient.id);
        }
      }

      if (request.mealPlanEntryId) {
        await tx
          .update(mealPlanEntries)
          .set({ state: 'cooked' })
          .where(eq(mealPlanEntries.id, request.mealPlanEntryId));
      }

      return { deductedItemIds, missingIngredientIds };
    });
  }

  /** 404s unless the meal-plan entry belongs to a plan owned by this household. */
  private async requireOwnedPlanEntry(householdId: string, entryId: string): Promise<void> {
    const [owned] = await this.db
      .select({ id: mealPlanEntries.id })
      .from(mealPlanEntries)
      .innerJoin(mealPlans, eq(mealPlanEntries.planId, mealPlans.id))
      .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlans.householdId, householdId)))
      .limit(1);
    if (!owned) throw AppError.notFound();
  }

  private async deductIngredient(
    tx: Tx,
    householdId: string,
    userId: string,
    ingredientId: string,
    needed: number,
    unit: string,
    mealPlanEntryId: string | null,
    deductedItemIds: string[],
  ): Promise<boolean> {
    const items = await tx
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.householdId, householdId), eq(inventoryItems.ingredientId, ingredientId)))
      .orderBy(inventoryItems.expiresAt)
      // Held for the rest of the transaction: the amount taken from each item
      // is computed from the quantity read here.
      .for('update');

    let remaining = needed;
    for (const item of items) {
      if (remaining <= 1e-6) break;
      const inItemUnit = convert(remaining, unit as Unit, item.unit as Unit);
      if (inItemUnit == null) continue; // incompatible dimension
      const available = Number(item.quantity);
      const take = Math.min(available, inItemUnit);
      if (take <= 1e-6) continue;

      await tx
        .update(inventoryItems)
        // Relative, and floored at zero — the same form the sync path uses, so
        // the two never disagree about what a concurrent write means.
        .set({
          quantity: sql`greatest(${inventoryItems.quantity} - ${numeric(take)}::numeric, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, item.id));
      await tx.insert(inventoryEvents).values({
        itemId: item.id,
        householdId,
        delta: numeric(-take),
        unit: item.unit,
        reason: 'consumed',
        mealPlanEntryId: mealPlanEntryId ?? null,
        actorUserId: userId,
      });
      deductedItemIds.push(item.id);

      const consumedInNeedUnit = convert(take, item.unit as Unit, unit as Unit);
      remaining -= consumedInNeedUnit ?? 0;
    }

    return remaining <= 1e-6;
  }

  private async loadRecipe(householdId: string, id: string): Promise<FullRecipeRow> {
    const row = await this.db.query.recipes.findFirst({
      where: eq(recipes.id, id),
      with: {
        ingredients: { with: { ingredient: true } },
      },
    });
    if (!row || (row.householdId !== null && row.householdId !== householdId)) {
      throw AppError.notFound('errors.NOT_FOUND');
    }
    return row as unknown as FullRecipeRow;
  }

  async localeFor(userId: string): Promise<Locale> {
    const [row] = await this.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return (row?.locale as Locale | undefined) ?? 'en';
  }
}

function toResolvedMedia(media: DishMedia, locale: Locale): ResolvedMedia {
  return {
    heroThumbnailUrl: media.heroThumbnailUrl,
    videos: media.videos.map((video) => ({ ...video, locale })),
  };
}
