import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
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
  recipeVideos,
  recipes,
  users,
} from '../../db/schema.js';
import { PANTRY_PORT, RESPONSE_CACHE, VIDEO_CACHE_TTL_DAYS, YOUTUBE_CLIENT } from '../ai.constants.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import { convert } from '../planner/units.js';
import { YoutubeUnavailableError, type YoutubeClient } from '../clients/clients.interface.js';
import { hashKey, type ResponseCachePort } from '../cache/response-cache.js';
import { toRecipe, type FullRecipeRow } from './recipe-mapper.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class RecipesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PANTRY_PORT) private readonly pantry: PantryPort,
    @Inject(YOUTUBE_CLIENT) private readonly youtube: YoutubeClient,
    @Inject(RESPONSE_CACHE) private readonly cache: ResponseCachePort,
  ) {}

  async getRecipe(householdId: string, id: string, requested?: Locale): Promise<Recipe> {
    const row = await this.loadRecipe(householdId, id);
    const locale = requested ?? (row.titleEn ? 'en' : 'ar');
    const snapshot = await this.pantry.snapshot(householdId);
    return toRecipe(row, locale, snapshot);
  }

  /**
   * Recipe videos (spec §5.5). Cached per recipe for 30 days; ids always come
   * from the YouTube API, never the LLM. When the quota is exhausted the recipe
   * is served with whatever is cached (possibly nothing) and the fetch is
   * retried later — the flow never dead-ends.
   */
  async getVideos(householdId: string, id: string, requested?: Locale): Promise<RecipeVideo[]> {
    const row = await this.loadRecipe(householdId, id);
    const locale = requested ?? (row.titleEn ? 'en' : 'ar');
    const title = locale === 'ar' ? row.titleAr ?? row.titleEn ?? '' : row.titleEn ?? row.titleAr ?? '';

    const freshCutoff = new Date(Date.now() - VIDEO_CACHE_TTL_DAYS * 86_400_000);
    const fresh = await this.db
      .select()
      .from(recipeVideos)
      .where(and(eq(recipeVideos.recipeId, id), gte(recipeVideos.fetchedAt, freshCutoff)))
      .orderBy(desc(recipeVideos.fetchedAt));
    if (fresh.length > 0) return fresh.map(toVideo);

    // "No rows" is indistinguishable from "never searched", so a recipe YouTube
    // has nothing for would re-run search.list on every single request — 100
    // quota units each, against a daily allowance of 10,000. Remember the empty
    // answer explicitly.
    const emptyKey = hashKey('recipe-videos-empty', { recipeId: id, locale });
    if (await this.cache.get<true>(emptyKey)) return [];

    try {
      const results = await this.youtube.search(title, locale);
      if (results.length === 0) {
        await this.cache.set(emptyKey, true, VIDEO_CACHE_TTL_DAYS * 86_400);
        return [];
      }
      const now = new Date();
      for (const v of results) {
        await this.db
          .insert(recipeVideos)
          .values({
            recipeId: id,
            youtubeId: v.youtubeId,
            title: v.title,
            channel: v.channel,
            thumbnailUrl: v.thumbnailUrl,
            durationSeconds: v.durationSeconds,
            locale,
          })
          // Renew fetchedAt, don't skip. `fetchedAt` only defaults on insert,
          // so doing nothing on conflict froze it at the first search: for a
          // popular recipe whose top results never change, the freshness
          // window could never reopen and every request past day 30 spent
          // another 100 quota units, forever.
          .onConflictDoUpdate({
            target: [recipeVideos.recipeId, recipeVideos.youtubeId],
            set: {
              title: v.title,
              channel: v.channel,
              thumbnailUrl: v.thumbnailUrl,
              durationSeconds: v.durationSeconds,
              locale,
              fetchedAt: now,
            },
          });
      }
      return results.map((v) => ({ ...v, locale }));
    } catch (err) {
      if (err instanceof YoutubeUnavailableError) {
        // Degrade: serve any cached videos (even stale), else none.
        const stale = await this.db
          .select()
          .from(recipeVideos)
          .where(eq(recipeVideos.recipeId, id))
          .orderBy(desc(recipeVideos.fetchedAt));
        return stale.map(toVideo);
      }
      throw err;
    }
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
        videos: true,
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

function toVideo(row: {
  youtubeId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  locale: Locale;
}): RecipeVideo {
  return {
    youtubeId: row.youtubeId,
    title: row.title,
    channel: row.channel,
    thumbnailUrl: row.thumbnailUrl,
    durationSeconds: row.durationSeconds,
    locale: row.locale,
  };
}
