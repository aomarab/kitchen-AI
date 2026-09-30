import { describe, expect, it } from 'vitest';
import {
  recipeIngredientAccessibilityLabel,
  recipeIngredientStatusKey,
} from './recipe-ingredient-row';

describe('recipeIngredientStatusKey', () => {
  it('returns the existing recipe stock status keys', () => {
    expect(recipeIngredientStatusKey({ inStock: true })).toBe('recipe.inStock');
    expect(recipeIngredientStatusKey({ inStock: false })).toBe('recipe.notInStock');
    expect(recipeIngredientStatusKey({})).toBe('recipe.notInStock');
  });
});

describe('recipeIngredientAccessibilityLabel', () => {
  it('reads the row in visual order: quantity, name, then stock status', () => {
    expect(
      recipeIngredientAccessibilityLabel({
        quantity: '800 g',
        name: 'Chicken breast',
        optionalLabel: null,
        statusLabel: 'In stock',
      }),
    ).toBe('800 g, Chicken breast, In stock');
  });

  it('includes the optional caption between the name and stock status', () => {
    expect(
      recipeIngredientAccessibilityLabel({
        quantity: '30 ml',
        name: 'Olive oil',
        optionalLabel: 'Optional',
        statusLabel: 'In stock',
      }),
    ).toBe('30 ml, Olive oil, Optional, In stock');
  });

  it('keeps signed quantities in the cooked sheet label', () => {
    expect(
      recipeIngredientAccessibilityLabel({
        quantity: '− 1½ cups',
        name: 'White rice',
        optionalLabel: null,
        statusLabel: 'Not in stock',
      }),
    ).toBe('− 1½ cups, White rice, Not in stock');
  });
});
