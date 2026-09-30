import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recipeThumbBranch } from './recipe-thumb-state';

const source = () => readFileSync(join(__dirname, 'RecipeThumb.tsx'), 'utf8');

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

  it('draws the J plate illustration on surfaceAlt, not the legacy tone glyph', () => {
    expect(source()).toMatch(/<Illustration name="plate"/);
    expect(source()).toContain('backgroundColor: colors.surfaceAlt');
    expect(source()).not.toContain('recipe-thumb-tones');
    expect(source()).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('requires image labels to be meaningful recipe content', () => {
    expect(source()).toMatch(/accessibilityLabel=\{accessibilityLabel \?\? title\}/);
  });
});
