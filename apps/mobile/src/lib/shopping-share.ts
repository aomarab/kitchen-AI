import type { Ingredient, ShoppingListItem, Unit } from '@kitchen/contracts';
import type { Locale } from '@kitchen/i18n';
import { localizedName } from './format';

export type ShoppingShareItem = Pick<
  ShoppingListItem,
  'nameEn' | 'nameAr' | 'quantity' | 'unit' | 'purchased'
>;

export type MeasureFormatter = (quantity: number, unit: Unit) => string;

export function formatShoppingListForShare(
  items: readonly ShoppingShareItem[],
  locale: Locale,
  formatMeasureText: MeasureFormatter,
): string {
  return items
    .filter((item) => !item.purchased)
    .map((item) => {
      const name = localizedName(locale, item.nameEn, item.nameAr);
      return `${name} ${formatMeasureText(item.quantity, item.unit)}`;
    })
    .join('\n');
}

export interface AddFieldAction {
  enabled: boolean;
  ingredient: Ingredient | null;
}

export function addFieldAction(term: string, results: readonly Ingredient[]): AddFieldAction {
  if (term.trim().length === 0 || results.length !== 1) {
    return { enabled: false, ingredient: null };
  }
  return { enabled: true, ingredient: results[0]! };
}
