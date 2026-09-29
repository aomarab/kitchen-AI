import { describe, expect, it } from 'vitest';
import {
  parseRecipeSegmentParam,
  parseServingsParam,
  recipeStockCount,
  recipeTopBarBacked,
  recipeTopBarFadeRange,
  scaleQuantityForServings,
  stepIngredients,
  type StepIngredient,
} from './recipe';

const INGREDIENTS = [
  ingredient('Tomato', 'طماطم', 2, 'piece'),
  ingredient('Olive oil', 'زيت الزيتون', 1, 'tbsp'),
  ingredient('Rice', 'أرز', 200, 'g'),
  ingredient('Potato', 'بطاطس', 3, 'piece'),
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

describe('parseRecipeSegmentParam', () => {
  it('opens the tab a deep link asks for', () => {
    expect(parseRecipeSegmentParam('videos')).toBe('videos');
    expect(parseRecipeSegmentParam(['steps'])).toBe('steps');
    expect(parseRecipeSegmentParam('ingredients')).toBe('ingredients');
  });

  it('falls back to the ingredients for anything else', () => {
    for (const value of [undefined, '', 'Videos', 'watch', ['nope'], 7]) {
      expect(parseRecipeSegmentParam(value)).toBe('ingredients');
    }
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

describe('recipeTopBarBacked', () => {
  const metrics = { heroHeight: 360, sheetOverlap: 28, barHeight: 100, fadeDistance: 24 };
  const range = recipeTopBarFadeRange(metrics);

  it('ends at the sheet-to-backing threshold', () => {
    expect(range.end).toBe(metrics.heroHeight - metrics.sheetOverlap - metrics.barHeight);
  });

  it('starts one spacing-xl before the backing threshold', () => {
    expect(range.start).toBe(range.end - 24);
  });

  it('stays transparent while the photo fills the bar area', () => {
    expect(recipeTopBarBacked(0, range)).toBe(false);
  });

  it('keeps the status bar on the photo before the fade starts', () => {
    expect(recipeTopBarBacked(range.start - 1, range)).toBe(false);
  });

  it('backs the status area when the fade starts', () => {
    expect(recipeTopBarBacked(range.start, range)).toBe(true);
  });

  it('is fully opaque at and after the fade end', () => {
    const opacityAt = (offsetY: number) =>
      Math.max(0, Math.min(1, (offsetY - range.start) / (range.end - range.start)));

    expect(opacityAt(range.end)).toBe(1);
    expect(opacityAt(range.end + 50)).toBe(1);
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
    expect(stepIngredients('Boil the water.', [ingredient('Oil', 'زيت', 1, 'tbsp')], 'en')).toEqual(
      [],
    );
  });

  it('matches English plural suffixes from singular ingredient names', () => {
    expect(stepIngredients('Cut potatoes into wedges.', INGREDIENTS, 'en')).toEqual([
      INGREDIENTS[3],
    ]);
  });

  it('matches Arabic names by substring', () => {
    expect(stepIngredients('أضيفي زيت الزيتون ثم الأرز.', INGREDIENTS, 'ar')).toEqual([
      INGREDIENTS[1],
      INGREDIENTS[2],
    ]);
  });

  it('matches Arabic article and proclitic forms word by word', () => {
    expect(stepIngredients('سخّني المقلاة بزيت الزيتون.', INGREDIENTS, 'ar')).toEqual([
      INGREDIENTS[1],
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
