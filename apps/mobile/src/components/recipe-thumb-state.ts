export type RecipeThumbSize = 56 | 72 | 196;

export function recipeThumbBranch(heroImageUrl: string | null | undefined, imageFailed = false) {
  return heroImageUrl && !imageFailed ? 'image' : 'placeholder';
}

export function plateSize(size: RecipeThumbSize): number {
  if (size === 196) return 72;
  return Math.round(size * 0.72);
}
