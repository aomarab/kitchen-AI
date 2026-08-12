import { describe, expect, it } from 'vitest';
import { ingredientCategorySchema } from '@kitchen/contracts';
import { categoryEmoji } from './ingredient-icon';

describe('categoryEmoji', () => {
  it('has a glyph for every category the contract can send', () => {
    for (const category of ingredientCategorySchema.options) {
      expect(categoryEmoji(category), category).not.toBe('');
    }
  });

  it('gives each category a distinct glyph, so the list stays scannable', () => {
    const glyphs = ingredientCategorySchema.options.map((c) => categoryEmoji(c));
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
