import type { IngredientCategory, Unit } from '@kitchen/contracts';
import type { Dimension } from './units.js';

/** A catalog ingredient row, as needed by resolution and Stage-C validation. */
export interface CatalogIngredientRef {
  id: string;
  canonicalNameEn: string;
  canonicalNameAr: string;
  aliases: string[];
  category: IngredientCategory;
  defaultUnit: Unit;
  isStaple: boolean;
}

/** A generated recipe ingredient after catalog resolution. */
export interface ResolvedRecipeIngredient {
  rawName: string;
  ingredient: CatalogIngredientRef | null;
  quantity: number;
  unit: Unit;
  optional: boolean;
}

/** A generated recipe whose ingredient names have been resolved to the catalog. */
export interface ResolvedRecipe {
  title: string;
  ingredients: ResolvedRecipeIngredient[];
}

/** One aggregated pantry line: total available of an ingredient in base units. */
export interface PantryEntry {
  ingredientId: string;
  nameEn: string;
  nameAr: string;
  dimension: Dimension;
  baseQuantity: number;
  displayUnit: Unit;
  isStaple: boolean;
  /** Soonest expiry among the aggregated items, or null. */
  expiresOn: string | null;
}

/**
 * Deterministic pantry snapshot (Stage A output). `byIngredientId` is the
 * available stock; `outOfStockStapleIds` are staples the household explicitly
 * marked unavailable, which then stop being assumed-available. See spec §5.4.
 */
export interface PantrySnapshot {
  byIngredientId: Map<string, PantryEntry>;
  outOfStockStapleIds: Set<string>;
}

export interface ValidationConstraints {
  /** Free-text allergies from the profile; a match is always rejected. */
  allergies: string[];
  halal: boolean;
}

export interface Shortfall {
  ingredientId: string;
  nameEn: string;
  nameAr: string;
  required: number;
  available: number;
  shortfall: number;
  unit: Unit;
}

export interface SafetyViolation {
  kind: 'allergy' | 'halal';
  ingredientName: string;
  detail: string;
}

export interface RecipeValidation {
  violations: SafetyViolation[];
  shortfalls: Shortfall[];
  /** No allergy/halal violations. An unsafe recipe must never reach a client. */
  safe: boolean;
  /** Safe and every required, non-staple ingredient is in stock. */
  fullyCovered: boolean;
}
