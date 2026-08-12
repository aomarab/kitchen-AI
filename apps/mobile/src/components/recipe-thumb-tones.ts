import type { ColorToken } from '../theme';

/**
 * Placeholder tones for recipes with no resolved image, kept in a plain module
 * so the palette guard can import them without pulling in React Native.
 *
 * Each tone is paired with a foreground that `theme/palette.spec.ts` proves
 * legible on it, so a tone cannot be added without a contrast-checked partner.
 */
export const RECIPE_THUMB_TONE_TOKENS = [
  'primarySoft',
  'accentSoft',
  'warnSoft',
  'successSoft',
] as const satisfies readonly ColorToken[];

export type RecipeThumbToneToken = (typeof RECIPE_THUMB_TONE_TOKENS)[number];

export const RECIPE_THUMB_TONE_FOREGROUNDS = {
  primarySoft: 'primaryText',
  accentSoft: 'accent',
  warnSoft: 'warn',
  successSoft: 'success',
} as const satisfies Record<RecipeThumbToneToken, ColorToken>;

export type RecipeThumbBranch = 'image' | 'placeholder';

/**
 * A thumbnail URL that 404s at render must degrade to the placeholder rather
 * than leave a broken box, so the render branch depends on load failure too.
 */
export function recipeThumbBranch(
  heroImageUrl: string | null | undefined,
  imageFailed = false,
): RecipeThumbBranch {
  return heroImageUrl && !imageFailed ? 'image' : 'placeholder';
}

/** FNV-1a, so the same dish keeps its tone across sessions and devices. */
export function recipeThumbToneForDish(dishKey: string): RecipeThumbToneToken {
  const source = (dishKey.trim().toLowerCase() || 'recipe').normalize('NFKC');
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193) >>> 0;
  }

  return (
    RECIPE_THUMB_TONE_TOKENS[hash % RECIPE_THUMB_TONE_TOKENS.length] ?? RECIPE_THUMB_TONE_TOKENS[0]
  );
}
