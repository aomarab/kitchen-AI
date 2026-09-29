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
  optionalLabel,
  statusLabel,
}: {
  quantity: string;
  name: string;
  optionalLabel?: string | null;
  statusLabel: string;
}): string {
  return [quantity, name, optionalLabel, statusLabel].filter(Boolean).join(', ');
}
