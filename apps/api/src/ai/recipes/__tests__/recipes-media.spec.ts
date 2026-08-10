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
import { dishMedia, dishVideos } from '../../../db/schema.js';
import { MediaService } from '../media.service.js';
import { RecipesService } from '../recipes.service.js';
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
