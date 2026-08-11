import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { toRecipe, type FullRecipeRow } from '../recipe-mapper.js';
import { NO_MEDIA } from '../media.service.js';
import { RecipesService } from '../recipes.service.js';
import { createTestContext, seedUser, seedHousehold, cleanup } from '../../../testing/harness.js';
import * as schema from '../../../db/schema.js';
import { dishMedia, dishVideos } from '../../../db/schema.js';
import { MediaService } from '../media.service.js';
import type { YoutubeVideo } from '../../clients/clients.interface.js';

/** Minimal FullRecipeRow for toRecipe unit tests. */
function makeRow(over: Partial<FullRecipeRow> = {}): FullRecipeRow {
  return {
    id: 'r1',
    householdId: null,
    titleEn: 'Menemen',
    titleAr: 'مينيمن',
    descriptionEn: 'A dish',
    descriptionAr: 'طبق',
    stepsEn: null,
    stepsAr: null,
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 2,
    difficulty: 'easy',
    cuisine: 'middle-eastern',
    nutrition: null,
    generatedBy: 'ai',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ingredients: [],
    ...over,
  };
}

describe('toRecipe: heroImageUrl and videos sourced from DishMedia', () => {
  it('uses heroThumbnailUrl from media when matched', () => {
    const media = {
      status: 'matched' as const,
      heroThumbnailUrl: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg',
      videos: [{ youtubeId: 'abc', title: 'Test', channel: 'Ch', thumbnailUrl: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg', durationSeconds: 300, locale: 'en' as const }],
    };
    const result = toRecipe(makeRow(), 'en', undefined, media);
    expect(result.heroImageUrl).toBe('https://i.ytimg.com/vi/abc/maxresdefault.jpg');
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]!.youtubeId).toBe('abc');
  });

  it('heroImageUrl is null and videos is empty when media is NO_MEDIA', () => {
    const result = toRecipe(makeRow(), 'en', undefined, NO_MEDIA);
    expect(result.heroImageUrl).toBeNull();
    expect(result.videos).toEqual([]);
  });
});

describe('RecipesService.getRecipe: hero image wired through MediaService', () => {
  const ctx = createTestContext();
  let userId: string;
  let householdId: string;
  let recipeId: string;

  const DISH_KEY_MAPPER = 'menemen';

  beforeAll(async () => {
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);

    const [recipe] = await ctx.db
      .insert(schema.recipes)
      .values({
        householdId,
        titleEn: 'Menemen',
        titleAr: 'مينيمن',
        descriptionEn: 'Eggs in sauce',
        descriptionAr: 'بيض في صلصة',
        stepsEn: [],
        stepsAr: [],
        prepMinutes: 10,
        cookMinutes: 20,
        servings: 2,
        difficulty: 'easy',
        cuisine: 'middle-eastern',
        generatedBy: 'ai',
      })
      .returning({ id: schema.recipes.id });
    if (!recipe) throw new Error('failed to seed recipe');
    recipeId = recipe.id;
  });

  afterAll(async () => {
    await ctx.db.delete(dishVideos).where(eq(dishVideos.dishKey, DISH_KEY_MAPPER));
    await ctx.db.delete(dishMedia).where(eq(dishMedia.dishKey, DISH_KEY_MAPPER));
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end();
  });

  it('getRecipe returns heroImageUrl from MediaService when a match exists', async () => {
    const fakeYoutube: YoutubeVideo = {
      youtubeId: 'mapper001',
      title: 'Menemen',
      channel: 'Test',
      thumbnailUrl: 'https://i.ytimg.com/vi/mapper001/maxresdefault.jpg',
      durationSeconds: 400,
      categoryId: '26',
      defaultAudioLanguage: 'en',
      embeddable: true,
    };
    const media = new MediaService(ctx.db, { search: vi.fn().mockResolvedValue([fakeYoutube]) });
    const fakePantry = { snapshot: vi.fn().mockResolvedValue({ byIngredientId: new Map(), outOfStockStapleIds: new Set() }) };
    const service = new RecipesService(ctx.db, fakePantry as never, media);

    const result = await service.getRecipe(householdId, recipeId, 'en');

    // heroImageUrl must come from the matched video, not null
    expect(result.heroImageUrl).toBe('https://i.ytimg.com/vi/mapper001/maxresdefault.jpg');
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]!.youtubeId).toBe('mapper001');
  });
});

