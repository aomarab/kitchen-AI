import { describe, expect, it } from 'vitest';
import { toRecipe, type FullRecipeRow } from '../recipe-mapper.js';

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
