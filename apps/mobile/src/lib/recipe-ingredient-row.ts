import type { MessageKey } from '@kitchen/i18n';

export interface RecipeIngredientStockState {
  inStock?: boolean;
}

export function recipeIngredientStatusKey(
  ingredient: RecipeIngredientStockState,
): Extract<MessageKey, 'recipe.inStock' | 'recipe.notInStock'> {
  return ingredient.inStock ? 'recipe.inStock' : 'recipe.notInStock';
}

export function recipeIngredientAccessibilityLabel({
  quantity,
  name,
  statusLabel,
}: {
  quantity: string;
  name: string;
  statusLabel: string;
}): string {
  return `${quantity}, ${name}, ${statusLabel}`;
}
