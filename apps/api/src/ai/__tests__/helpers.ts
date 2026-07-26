import type {
  GeneratedPlan,
  GeneratedRecipe,
  IngredientCategory,
  Unit,
} from '@kitchen/contracts';
import type {
  CatalogIngredientRef,
  PantryEntry,
  PantrySnapshot,
  ResolvedRecipeIngredient,
} from '../planner/types.js';
import type { ResolvedName } from '../catalog/ingredient-resolver.port.js';
import { dimensionOf, toBase } from '../planner/units.js';

let seq = 0;
export function uuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

export function cat(overrides: Partial<CatalogIngredientRef> = {}): CatalogIngredientRef {
  return {
    id: overrides.id ?? uuid(),
    canonicalNameEn: overrides.canonicalNameEn ?? 'Ingredient',
    canonicalNameAr: overrides.canonicalNameAr ?? 'مكوّن',
    aliases: overrides.aliases ?? [],
    category: overrides.category ?? ('other' as IngredientCategory),
    defaultUnit: overrides.defaultUnit ?? ('g' as Unit),
    isStaple: overrides.isStaple ?? false,
  };
}

export function ingredient(
  ref: CatalogIngredientRef | null,
  quantity: number,
  unit: Unit,
  optional = false,
  rawName?: string,
): ResolvedRecipeIngredient {
  return {
    rawName: rawName ?? ref?.canonicalNameEn ?? 'raw',
    ingredient: ref,
    quantity,
    unit,
    optional,
  };
}

/** Build a snapshot from (ref, availableQuantity, unit) lines. */
export function snapshotOf(
  lines: { ref: CatalogIngredientRef; quantity: number; unit: Unit; expiresOn?: string }[],
  outOfStockStapleIds: string[] = [],
): PantrySnapshot {
  const byIngredientId = new Map<string, PantryEntry>();
  for (const l of lines) {
    byIngredientId.set(l.ref.id, {
      ingredientId: l.ref.id,
      nameEn: l.ref.canonicalNameEn,
      nameAr: l.ref.canonicalNameAr,
      dimension: dimensionOf(l.unit),
      baseQuantity: toBase(l.quantity, l.unit),
      displayUnit: l.ref.defaultUnit,
      isStaple: l.ref.isStaple,
      expiresOn: l.expiresOn ?? null,
    });
  }
  return { byIngredientId, outOfStockStapleIds: new Set(outOfStockStapleIds) };
}

export function genRecipe(
  title: string,
  ingredients: { name: string; quantity: number; unit: Unit; optional?: boolean }[],
): GeneratedRecipe {
  return {
    title,
    description: `${title} description`,
    cuisine: 'levantine',
    difficulty: 'easy',
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 2,
    ingredients: ingredients.map((i) => ({ ...i, optional: i.optional ?? false })),
    steps: ['Step one', 'Step two'],
    nutritionPerServing: { calories: 400, proteinG: 20, carbsG: 40, fatG: 12 },
  };
}

export function genPlan(
  entries: { date: string; slot: string; recipe: GeneratedRecipe }[],
): GeneratedPlan {
  return { entries: entries as GeneratedPlan['entries'] };
}

/** A resolver stub mapping recipe ingredient names to provided catalog refs. */
export function resolverFor(refs: CatalogIngredientRef[]) {
  const byName = new Map<string, CatalogIngredientRef>();
  for (const r of refs) {
    byName.set(r.canonicalNameEn.trim().toLowerCase(), r);
    byName.set(r.canonicalNameAr.trim().toLowerCase(), r);
    for (const a of r.aliases) byName.set(a.trim().toLowerCase(), r);
  }
  return async (names: string[]): Promise<ResolvedName[]> =>
    names.map((name) => {
      const ref = byName.get(name.trim().toLowerCase()) ?? null;
      return {
        rawName: name,
        ingredient: ref,
        strategy: ref ? 'exact' : 'unresolved',
        confidence: ref ? 1 : 0,
      };
    });
}
