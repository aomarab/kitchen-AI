import { findViolations } from './safety.js';
import { dimensionOf, fromBase, toBase } from './units.js';
import type {
  PantrySnapshot,
  RecipeValidation,
  ResolvedRecipe,
  Shortfall,
  ValidationConstraints,
} from './types.js';

const EPSILON = 1e-6;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Stage C (spec §5.4): deterministically re-check a generated recipe against the
 * real pantry and against allergy/halal constraints. This — not the model — is
 * the source of truth for whether a plan is safe and cookable.
 *
 * - Safety (allergy/halal) violations make a recipe unsafe; it must never reach
 *   a client regardless of plan scope.
 * - Staples are assumed available unless explicitly marked out of stock.
 * - Optional ingredients never create a shortfall.
 * - A required ingredient stored in an incompatible dimension counts as a full
 *   shortfall (we cannot prove coverage).
 */
export function validateRecipe(
  recipe: ResolvedRecipe,
  snapshot: PantrySnapshot,
  constraints: ValidationConstraints,
): RecipeValidation {
  const violations = findViolations(recipe.ingredients, constraints);
  const shortfalls: Shortfall[] = [];

  for (const ing of recipe.ingredients) {
    if (ing.optional) continue;
    const cat = ing.ingredient;

    if (!cat) {
      // Unresolved name: cannot prove it is in stock, so it is a full shortfall.
      shortfalls.push({
        ingredientId: '',
        nameEn: ing.rawName,
        nameAr: ing.rawName,
        required: round(ing.quantity),
        available: 0,
        shortfall: round(ing.quantity),
        unit: ing.unit,
      });
      continue;
    }

    if (cat.isStaple && !snapshot.outOfStockStapleIds.has(cat.id)) continue;

    const entry = snapshot.byIngredientId.get(cat.id);
    const requiredBase = toBase(ing.quantity, ing.unit);
    const requiredDim = dimensionOf(ing.unit);
    const availableBase = entry && entry.dimension === requiredDim ? entry.baseQuantity : 0;

    if (requiredBase > availableBase + EPSILON) {
      const shortBase = requiredBase - availableBase;
      shortfalls.push({
        ingredientId: cat.id,
        nameEn: cat.canonicalNameEn,
        nameAr: cat.canonicalNameAr,
        required: round(ing.quantity),
        available: round(fromBase(availableBase, ing.unit)),
        shortfall: round(fromBase(shortBase, ing.unit)),
        unit: ing.unit,
      });
    }
  }

  const safe = violations.length === 0;
  return { violations, shortfalls, safe, fullyCovered: shortfalls.length === 0 };
}

/** Merge shortfalls across many recipes, summing quantities per ingredient+unit. */
export function mergeShortfalls(shortfalls: Shortfall[]): Shortfall[] {
  const byKey = new Map<string, Shortfall>();
  for (const s of shortfalls) {
    const key = `${s.ingredientId || s.nameEn}:${s.unit}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.required = round(existing.required + s.required);
      existing.available = round(Math.max(existing.available, s.available));
      existing.shortfall = round(existing.shortfall + s.shortfall);
    } else {
      byKey.set(key, { ...s });
    }
  }
  return [...byKey.values()];
}
