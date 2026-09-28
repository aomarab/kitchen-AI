import { describe, expect, it } from 'vitest';
import { ingredientCategorySchema } from '@kitchen/contracts';
import { ILLUSTRATION_PATHS } from '../components/glyphs/illustration-paths';
import { allIconKeys } from './food-icon';
import { FOOD_CATEGORY_ILLUSTRATION, FOOD_ILLUSTRATION } from './food-illustration';

describe('food illustration mapping', () => {
  it('covers every food icon key with an existing J illustration', () => {
    const illustrations = new Set<string>(Object.keys(ILLUSTRATION_PATHS));
    const missing = allIconKeys().filter((key) => !(key in FOOD_ILLUSTRATION));
    expect(missing).toEqual([]);

    for (const key of allIconKeys()) {
      const illustration = FOOD_ILLUSTRATION[key];
      expect(illustrations.has(illustration), `${key} → ${illustration}`).toBe(true);
    }
  });

  it('covers every contract category fallback with an existing J illustration', () => {
    const illustrations = new Set<string>(Object.keys(ILLUSTRATION_PATHS));

    for (const category of ingredientCategorySchema.options) {
      const illustration = FOOD_CATEGORY_ILLUSTRATION[category];
      expect(illustrations.has(illustration), `${category} → ${illustration}`).toBe(true);
    }
  });

  it('uses exact drawings when J has one', () => {
    expect(FOOD_ILLUSTRATION.apple).toBe('apple');
    expect(FOOD_ILLUSTRATION.bread).toBe('bread');
    expect(FOOD_ILLUSTRATION.carrot).toBe('carrot');
    expect(FOOD_ILLUSTRATION.cheese).toBe('cheese');
    expect(FOOD_ILLUSTRATION.chicken).toBe('chicken');
    expect(FOOD_ILLUSTRATION.egg).toBe('egg');
    expect(FOOD_ILLUSTRATION.garlic).toBe('garlic');
    expect(FOOD_ILLUSTRATION.herbs).toBe('herb');
    expect(FOOD_ILLUSTRATION.lemon).toBe('lemon');
    expect(FOOD_ILLUSTRATION.milk).toBe('milk');
    expect(FOOD_ILLUSTRATION.oliveoil).toBe('oil');
    expect(FOOD_ILLUSTRATION.onion).toBe('onion');
    expect(FOOD_ILLUSTRATION.potato).toBe('potato');
    expect(FOOD_ILLUSTRATION.rice).toBe('rice');
    expect(FOOD_ILLUSTRATION.salt).toBe('salt');
    expect(FOOD_ILLUSTRATION.tomato).toBe('tomato');
  });
});
