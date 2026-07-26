import { and, desc, eq, gte } from 'drizzle-orm';
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
import {
  inventoryEvents,
  inventoryItems,
  mealPlanEntries,
  recipeVideos,
  recipes,
  users,
} from '../../db/schema.js';
import { PANTRY_PORT, VIDEO_CACHE_TTL_DAYS, YOUTUBE_CLIENT } from '../ai.constants.js';
import type { PantryPort } from '../planner/pantry-snapshot.js';
import { convert } from '../planner/units.js';
import { YoutubeUnavailableError, type YoutubeClient } from '../clients/clients.interface.js';
import { toRecipe, type FullRecipeRow } from './recipe-mapper.js';

@Injectable()
export class RecipesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PANTRY_PORT) private readonly pantry: PantryPort,
    @Inject(YOUTUBE_CLIENT) private readonly youtube: YoutubeClient,
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

    try {
      const results = await this.youtube.search(title, locale);
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
          .onConflictDoNothing({ target: [recipeVideos.recipeId, recipeVideos.youtubeId] });
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

  /** Marks a recipe cooked and deducts its ingredients from inventory (spec §4.2). */
  async markCooked(
    householdId: string,
    userId: string,
    id: string,
    request: MarkCookedRequest,
  ): Promise<MarkCookedResponse> {
    const row = await this.loadRecipe(householdId, id);
    const scale = (request.servings ?? row.servings) / (row.servings || 1);

    const deductedItemIds: string[] = [];
    const missingIngredientIds: string[] = [];

    if (request.deductInventory) {
      for (const ing of row.ingredients) {
        if (ing.optional || ing.ingredient.isStaple) continue;
        const need = Number(ing.quantity) * scale;
        const done = await this.deductIngredient(
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
      await this.db
        .update(mealPlanEntries)
        .set({ state: 'cooked' })
        .where(eq(mealPlanEntries.id, request.mealPlanEntryId));
    }

    return { deductedItemIds, missingIngredientIds };
  }

  private async deductIngredient(
    householdId: string,
    userId: string,
    ingredientId: string,
    needed: number,
    unit: string,
    mealPlanEntryId: string | null,
    deductedItemIds: string[],
  ): Promise<boolean> {
    const items = await this.db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.householdId, householdId), eq(inventoryItems.ingredientId, ingredientId)))
      .orderBy(inventoryItems.expiresAt);

    let remaining = needed;
    for (const item of items) {
      if (remaining <= 1e-6) break;
      const inItemUnit = convert(remaining, unit as Unit, item.unit as Unit);
      if (inItemUnit == null) continue; // incompatible dimension
      const available = Number(item.quantity);
      const take = Math.min(available, inItemUnit);
      if (take <= 1e-6) continue;

      const newQty = available - take;
      await this.db
        .update(inventoryItems)
        .set({ quantity: newQty.toFixed(3), updatedAt: new Date() })
        .where(eq(inventoryItems.id, item.id));
      await this.db.insert(inventoryEvents).values({
        itemId: item.id,
        householdId,
        delta: (-take).toFixed(3),
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
