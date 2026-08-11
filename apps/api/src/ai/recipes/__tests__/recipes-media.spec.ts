/**
 * Integration tests: RecipesService wires MediaService for hero image and videos.
 *
 * Docker infra (PostgreSQL) must be running with migrations applied.
 * Each test uses unique dish keys and cleans up after itself.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestContext, seedUser, seedHousehold, cleanup } from '../../../testing/harness.js';
import * as schema from '../../../db/schema.js';
import { dishMedia, dishVideos, mealPlans, mealPlanEntries } from '../../../db/schema.js';
import { MediaService } from '../media.service.js';
import { RecipesService } from '../recipes.service.js';
import { PlanService } from '../../plan/plan.service.js';
import type { YoutubeClient, YoutubeVideo } from '../../clients/clients.interface.js';

const ctx = createTestContext();

afterAll(async () => {
  await ctx.client.end();
});

/** Dish key for "Shakshuka" — "shakshuka" */
const DISH_KEY = 'shakshuka';

function fakeYoutube(videos: YoutubeVideo[]): YoutubeClient {
  return { search: vi.fn(async () => videos) };
}

function baseVideo(over: Partial<YoutubeVideo> = {}): YoutubeVideo {
  return {
    youtubeId: 'abc123',
    title: 'Shakshuka Recipe',
    channel: 'Test Kitchen',
    thumbnailUrl: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
    durationSeconds: 360,
    categoryId: '26',
    defaultAudioLanguage: 'en',
    embeddable: true,
    ...over,
  };
}

async function seedRecipe(householdId: string) {
  const [recipe] = await ctx.db
    .insert(schema.recipes)
    .values({
      householdId,
      titleEn: 'Shakshuka',
      titleAr: 'شكشوكة',
      descriptionEn: 'Eggs in tomato sauce',
      descriptionAr: 'بيض في صلصة الطماطم',
      stepsEn: [{ index: 1, text: 'Cook', durationMinutes: 20 }],
      stepsAr: [{ index: 1, text: 'اطبخ', durationMinutes: 20 }],
      prepMinutes: 5,
      cookMinutes: 20,
      servings: 2,
      difficulty: 'easy',
      cuisine: 'middle-eastern',
      generatedBy: 'ai',
    })
    .returning({ id: schema.recipes.id });
  if (!recipe) throw new Error('seed failed');
  return recipe.id;
}

async function deleteDishRows() {
  await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, DISH_KEY));
  await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, DISH_KEY));
}

function buildService(yt: YoutubeClient) {
  const media = new MediaService(ctx.db, yt);
  const fakePantry = { snapshot: vi.fn().mockResolvedValue({ byIngredientId: new Map(), outOfStockStapleIds: new Set() }) };
  return new RecipesService(ctx.db, fakePantry as never, media);
}

describe('RecipesService hero image wiring', () => {
  let userId: string;
  let householdId: string;
  let recipeId: string;

  beforeAll(async () => {
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);
    recipeId = await seedRecipe(householdId);
  });

  afterAll(async () => {
    await deleteDishRows();
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
  });

  it('sets heroImageUrl from the winning video thumbnail', async () => {
    const yt = fakeYoutube([baseVideo()]);
    const service = buildService(yt);

    const recipe = await service.getRecipe(householdId, recipeId, 'en');

    expect(recipe.heroImageUrl).toBe('https://i.ytimg.com/vi/abc123/maxresdefault.jpg');
  });

  it('heroImageUrl is null when no video matches the dish', async () => {
    await deleteDishRows();
    // categoryId 10 = music — relevance scorer rejects it
    const yt = fakeYoutube([baseVideo({ youtubeId: 'rickroll', title: 'Never Gonna Give You Up', categoryId: '10' })]);
    const service = buildService(yt);

    const recipe = await service.getRecipe(householdId, recipeId, 'en');

    expect(recipe.heroImageUrl).toBeNull();
  });
});

describe('RecipesService getVideos wiring', () => {
  let userId: string;
  let householdId: string;
  let recipeId: string;

  beforeAll(async () => {
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);
    recipeId = await seedRecipe(householdId);
    await deleteDishRows();
  });

  afterAll(async () => {
    await deleteDishRows();
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
  });

  it('returns videos in rank order (best first)', async () => {
    const v1 = baseVideo({ youtubeId: 'best001', title: 'Shakshuka', durationSeconds: 400 });
    const v2 = baseVideo({ youtubeId: 'second02', title: 'Shakshuka quick easy recipe', durationSeconds: 300 });
    const yt = fakeYoutube([v1, v2]);
    const service = buildService(yt);

    // First call populates DB, second reads from cache
    await service.getVideos(householdId, recipeId, 'en');
    const videos = await service.getVideos(householdId, recipeId, 'en');

    expect(videos.length).toBe(2);
    expect(videos[0]!.youtubeId).toBe('best001');
    expect(videos[1]!.youtubeId).toBe('second02');
  });

  it('returns empty array when no match found', async () => {
    await deleteDishRows();
    const yt = fakeYoutube([baseVideo({ youtubeId: 'rickroll', title: 'Never Gonna Give You Up', categoryId: '10' })]);
    const service = buildService(yt);

    const videos = await service.getVideos(householdId, recipeId, 'en');

    expect(videos).toEqual([]);
  });
});

describe('PlanService.updateEntry: heroImageUrl is non-null after update when media exists', () => {
  /** Distinct dish key to avoid cross-test pollution. */
  const UPDATE_DISH_KEY = 'mandi-rice';
  let userId2: string;
  let householdId2: string;
  let planId: string;
  let entryId: string;
  let recipeId2: string;

  beforeAll(async () => {
    // Clear any stale dish_media rows before seeding
    await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, UPDATE_DISH_KEY));
    await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, UPDATE_DISH_KEY));

    userId2 = await seedUser(ctx.db);
    householdId2 = await seedHousehold(ctx.db, userId2);

    const [recipe] = await ctx.db
      .insert(schema.recipes)
      .values({
        householdId: householdId2,
        titleEn: 'Mandi Rice',
        titleAr: 'أرز مندي',
        descriptionEn: 'Yemeni rice dish',
        descriptionAr: 'طبق أرز سعودي',
        stepsEn: [{ index: 1, text: 'Cook', durationMinutes: 60 }],
        stepsAr: [{ index: 1, text: 'اطبخ', durationMinutes: 60 }],
        prepMinutes: 15,
        cookMinutes: 60,
        servings: 4,
        difficulty: 'medium',
        cuisine: 'middle-eastern',
        generatedBy: 'ai',
      })
      .returning({ id: schema.recipes.id });
    if (!recipe) throw new Error('seed recipe failed');
    recipeId2 = recipe.id;

    const [plan] = await ctx.db
      .insert(mealPlans)
      .values({
        householdId: householdId2,
        scope: 'daily',
        startsOn: '2026-08-11',
        endsOn: '2026-08-11',
        status: 'ready',
        locale: 'en',
      })
      .returning({ id: mealPlans.id });
    if (!plan) throw new Error('seed plan failed');
    planId = plan.id;

    const [entry] = await ctx.db
      .insert(mealPlanEntries)
      .values({
        planId,
        recipeId: recipeId2,
        date: '2026-08-11',
        slot: 'lunch',
        servings: 4,
        state: 'planned',
        fullyCovered: true,
        position: 0,
      })
      .returning({ id: mealPlanEntries.id });
    if (!entry) throw new Error('seed entry failed');
    entryId = entry.id;
  });

  afterAll(async () => {
    await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, UPDATE_DISH_KEY));
    await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, UPDATE_DISH_KEY));
    await cleanup(ctx.db, { households: [householdId2], users: [userId2] });
  });

  it('updateEntry response carries heroImageUrl from MediaService, not null', async () => {
    const video: YoutubeVideo = {
      youtubeId: 'mandi999',
      title: 'Mandi Rice',
      channel: 'Test Kitchen',
      thumbnailUrl: 'https://i.ytimg.com/vi/mandi999/maxresdefault.jpg',
      durationSeconds: 742,
      categoryId: '26',
      defaultAudioLanguage: 'en',
      embeddable: true,
    };
    const media = new MediaService(ctx.db, fakeYoutube([video]));
    const service = new PlanService(ctx.db, undefined as never, undefined as never, media);

    const result = await service.updateEntry(householdId2, planId, entryId, { servings: 2 });

    expect(result.recipe.heroImageUrl).toBe('https://i.ytimg.com/vi/mandi999/maxresdefault.jpg');
  });
});
