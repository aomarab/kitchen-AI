import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { toRecipe, type FullRecipeRow } from '../recipe-mapper.js';
import { RecipesService } from '../recipes.service.js';
import { createTestContext, seedUser, seedHousehold, cleanup } from '../../../testing/harness.js';
import type { TestDatabase } from '../../../testing/harness.js';
import * as schema from '../../../db/schema.js';

describe('toRecipe (runtime safety with missing videos)', () => {
  it('handles rows with empty videos array (as returned by loadRecipe after schema change)', () => {
    const recipeRow: FullRecipeRow = {
      id: 'r1',
      householdId: null,
      titleEn: 'Shakshuka',
      titleAr: 'شكشوكة',
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
      videos: [], // Simulate what loadRecipe supplies after schema change
    };

    // Should not throw "Cannot read properties of undefined (reading 'map')"
    const result = toRecipe(recipeRow, 'en');

    expect(result).toBeDefined();
    expect(result.videos).toEqual([]);
    expect(result.title).toBe('Shakshuka');
  });
});

describe('RecipesService.getRecipe (integration: real loadRecipe path)', () => {
  let ctx = null as any;
  let userId: string;
  let householdId: string;
  let recipeId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);

    // Seed a recipe with ingredients. The videos relation no longer exists
    // in the schema, so the query will return a row without a videos key.
    // loadRecipe() must supply videos: [] explicitly.
    const [recipe] = await ctx.db
      .insert(schema.recipes)
      .values({
        householdId,
        titleEn: 'Shakshuka',
        titleAr: 'شكشوكة',
        descriptionEn: 'Eggs poached in sauce',
        descriptionAr: 'بيض مطهو بالصلصة',
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
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end();
  });

  it('getRecipe succeeds despite videos relation being removed from schema', async () => {
    // Mock the pantry service to return an empty snapshot.
    // The important path is: loadRecipe → database query (with no videos relation)
    // → toRecipe (which expects videos to be present).
    const mockPantry = {
      snapshot: vi.fn().mockResolvedValue({}),
    };

    const service = new RecipesService(ctx.db, mockPantry, { resolve: vi.fn().mockResolvedValue({ status: 'none', heroThumbnailUrl: null, videos: [] }) } as never);

    // This exercises the real loadRecipe() → database query path.
    // Before the fix (loadRecipe without videos: []), this would crash with:
    // TypeError: Cannot read properties of undefined (reading 'map')
    // because toRecipe calls row.videos.map() on an undefined field.
    const result = await service.getRecipe(householdId, recipeId, 'en');

    expect(result).toBeDefined();
    expect(result.id).toBe(recipeId);
    expect(result.title).toBe('Shakshuka');
    expect(result.videos).toEqual([]); // Proves loadRecipe supplied the empty array
  });
});

