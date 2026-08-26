import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palettes } from '../theme/palettes';

import {
  RECIPE_THUMB_TONE_TOKENS,
  recipeThumbBranch,
  recipeThumbToneForDish,
} from './recipe-thumb-tones';

const source = () => readFileSync(join(__dirname, 'RecipeThumb.tsx'), 'utf8');
const colors = palettes.violet.light.colors;

describe('recipe thumb tone selection', () => {
  it('is deterministic for a given dish key', () => {
    const repeated = Array.from({ length: 64 }, () => recipeThumbToneForDish('dish-2'));

    expect(repeated).toEqual(Array.from({ length: 64 }, () => 'warnSoft'));
  });

  it('keeps known dish keys on their approved tones', () => {
    expect(recipeThumbToneForDish('dish-0')).toBe('primarySoft');
    expect(recipeThumbToneForDish('dish-1')).toBe('successSoft');
    expect(recipeThumbToneForDish('dish-2')).toBe('warnSoft');
    expect(recipeThumbToneForDish('dish-3')).toBe('accentSoft');
    expect(recipeThumbToneForDish('شاورما دجاج')).toBe('accentSoft');
  });

  it('only returns palette token names that exist in the mobile theme', () => {
    const allowed = new Set<string>(RECIPE_THUMB_TONE_TOKENS);
    const sampled = ['dish-0', 'dish-1', 'dish-2', 'dish-3', 'chicken-kabsa', 'شاورما دجاج'].map(
      (key) => recipeThumbToneForDish(key),
    );

    expect(new Set(sampled)).toEqual(allowed);
    for (const token of RECIPE_THUMB_TONE_TOKENS) {
      expect(colors[token], `${token} must resolve through theme/palettes.ts`).toEqual(
        expect.any(String),
      );
    }
    for (const token of sampled) {
      expect(allowed.has(token), `${token} must be one of the approved recipe thumb tones`).toBe(
        true,
      );
      expect(colors[token], `${token} must be a real theme color token`).toEqual(
        expect.any(String),
      );
    }
  });
});

describe('recipe thumb branch selection', () => {
  it('uses the placeholder when the API has no hero image', () => {
    expect(recipeThumbBranch(null)).toBe('placeholder');
    expect(recipeThumbBranch(undefined)).toBe('placeholder');
  });

  it('uses the image branch when a hero image is present', () => {
    expect(recipeThumbBranch('https://images.kitchenai.dev/recipes/kabsa.jpg')).toBe('image');
  });

  it('falls back to the placeholder after an image load failure', () => {
    expect(recipeThumbBranch('https://images.kitchenai.dev/recipes/kabsa.jpg', true)).toBe(
      'placeholder',
    );
  });
});

describe('recipe thumb accessibility source guards', () => {
  it('keeps decorative placeholders out of the accessibility tree', () => {
    expect(source()).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });

  it('draws the placeholder glyph from the shared icon set, not an emoji', () => {
    // Emoji render differently on every platform and ignore the theme colour,
    // so the glyph would neither match the app nor respect its tone pairing.
    expect(source()).toMatch(/<Icon name="restaurant"/);
    expect(source()).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('requires image labels to be meaningful recipe content', () => {
    expect(source()).toMatch(/accessibilityLabel=\{accessibilityLabel \?\? title\}/);
  });
});
