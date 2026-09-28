import type { Unit } from '@kitchen/contracts';
import type { Locale } from '@kitchen/i18n';

export interface StockCountIngredient {
  optional?: boolean;
  inStock?: boolean;
}

export interface IngredientNamePair {
  canonicalNameEn: string;
  canonicalNameAr: string;
}

export interface StepIngredient {
  ingredient: IngredientNamePair;
  quantity: number;
  unit: Unit;
}

const MAX_SERVINGS_PARAM = 24;
const WORD_CHAR = 'A-Za-z0-9';
const ARABIC_RE = /[\u0600-\u06FF]/;

export function recipeStockCount(ingredients: readonly StockCountIngredient[]): {
  have: number;
  total: number;
} {
  const counted = ingredients.filter((ingredient) => !ingredient.optional);
  return {
    have: counted.filter((ingredient) => ingredient.inStock === true).length,
    total: counted.length,
  };
}

export function scaleQuantityForServings(
  quantity: number,
  baseServings: number,
  targetServings: number,
): number {
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(baseServings) ||
    !Number.isFinite(targetServings) ||
    baseServings <= 0 ||
    targetServings <= 0
  ) {
    return quantity;
  }
  return Math.round((quantity * targetServings * 100) / baseServings) / 100;
}

export function parseServingsParam(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_SERVINGS_PARAM) return null;
  return parsed;
}

export function stepIngredients<T extends StepIngredient>(
  stepText: string,
  ingredients: readonly T[],
  locale: Locale,
): T[] {
  const text = stepText.trim();
  if (!text) return [];

  return ingredients.filter((item) => {
    const localName =
      locale === 'ar' ? item.ingredient.canonicalNameAr : item.ingredient.canonicalNameEn;
    const names = new Set([localName, item.ingredient.canonicalNameEn]);
    for (const name of names) {
      if (containsIngredientName(text, name)) return true;
    }
    return false;
  });
}

function containsIngredientName(text: string, name: string): boolean {
  const needle = name.trim();
  if (!needle) return false;

  if (ARABIC_RE.test(needle)) {
    return text.includes(needle);
  }

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();
  const haystack = text.toLowerCase();
  const pattern = new RegExp(`(^|[^${WORD_CHAR}])${escaped}(?=$|[^${WORD_CHAR}])`);
  return pattern.test(haystack);
}
