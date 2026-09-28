import { describe, expect, it } from 'vitest';
import {
  parseServingsParam,
  recipeStockCount,
  scaleQuantityForServings,
  stepIngredients,
  type StepIngredient,
} from './recipe';

const INGREDIENTS = [
  ingredient('Tomato', 'طماطم', 2, 'piece'),
  ingredient('Olive oil', 'زيت الزيتون', 1, 'tbsp'),
  ingredient('Rice', 'أرز', 200, 'g'),
] as const;

function ingredient(
  canonicalNameEn: string,
  canonicalNameAr: string,
  quantity: number,
  unit: StepIngredient['unit'],
): StepIngredient {
  return { ingredient: { canonicalNameEn, canonicalNameAr }, quantity, unit };
}

describe('recipeStockCount', () => {
  it('counts only required ingredients that are in stock', () => {
    expect(
      recipeStockCount([
        { inStock: true },
        { inStock: false },
        { inStock: true, optional: true },
        { optional: true },
      ]),
    ).toEqual({ have: 1, total: 2 });
  });
});

describe('scaleQuantityForServings', () => {
  it('scales a measure by the requested serving count', () => {
    expect(scaleQuantityForServings(1.5, 4, 6)).toBe(2.25);
  });

  it('rounds to the same two display decimals as formatMeasure', () => {
    expect(scaleQuantityForServings(1, 3, 2)).toBe(0.67);
  });
});

describe('parseServingsParam', () => {
  it('accepts integer strings from 1 to 24', () => {
    expect(parseServingsParam('1')).toBe(1);
    expect(parseServingsParam('24')).toBe(24);
    expect(parseServingsParam(['4'])).toBe(4);
  });

  it('ignores invalid, fractional and out-of-range values', () => {
    for (const value of [undefined, '', '0', '1.5', '25', '-2', 'abc']) {
      expect(parseServingsParam(value)).toBeNull();
    }
  });
});

describe('stepIngredients', () => {
  it('matches English names case-insensitively on word boundaries', () => {
    expect(stepIngredients('Warm the olive oil, then add the TOMATO.', INGREDIENTS, 'en')).toEqual([
      INGREDIENTS[0],
      INGREDIENTS[1],
    ]);
  });

  it('does not match English names inside unrelated words', () => {
    expect(stepIngredients('Check the price before cooking.', INGREDIENTS, 'en')).toEqual([]);
  });

  it('matches Arabic names by substring', () => {
    expect(stepIngredients('أضيفي زيت الزيتون ثم الأرز.', INGREDIENTS, 'ar')).toEqual([
      INGREDIENTS[1],
      INGREDIENTS[2],
    ]);
  });

  it('returns nothing when no ingredient name is present', () => {
    expect(stepIngredients('Simmer until glossy.', INGREDIENTS, 'en')).toEqual([]);
  });

  it('returns each matched ingredient once even when a name repeats', () => {
    expect(stepIngredients('Tomato, tomato and more tomato.', INGREDIENTS, 'en')).toEqual([
      INGREDIENTS[0],
    ]);
  });
});
