import type { Unit } from '@kitchen/contracts';
import { dimensionOf, toBase, type Dimension } from './units.js';
import type { PantryEntry, PantrySnapshot } from './types.js';

/**
 * One inventory row as read from the database, before aggregation. Kept as a
 * plain shape so {@link buildSnapshot} is a pure function that can be unit-tested
 * without a database.
 */
export interface InventoryRow {
  ingredientId: string;
  nameEn: string;
  nameAr: string;
  defaultUnit: Unit;
  isStaple: boolean;
  quantity: number;
  unit: Unit;
  expiresOn: string | null;
}

export interface PantryPort {
  snapshot(householdId: string): Promise<PantrySnapshot>;
}

function earlier(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a <= b ? a : b;
}

/**
 * Stage A (spec §5.4): fold raw inventory rows into a deterministic pantry
 * snapshot. Quantities are summed in each ingredient's base dimension so Stage C
 * coverage math is exact. No LLM is involved. Items whose unit lies in a
 * different dimension than the ingredient's default unit are ignored for that
 * ingredient (they cannot be proven to cover a recipe quantity).
 */
export function buildSnapshot(rows: InventoryRow[]): PantrySnapshot {
  const byIngredientId = new Map<string, PantryEntry>();

  for (const row of rows) {
    const targetDim: Dimension = dimensionOf(row.defaultUnit);
    if (dimensionOf(row.unit) !== targetDim) continue;

    const existing = byIngredientId.get(row.ingredientId);
    const base = toBase(row.quantity, row.unit);
    if (existing) {
      existing.baseQuantity += base;
      existing.expiresOn = earlier(existing.expiresOn, row.expiresOn);
    } else {
      byIngredientId.set(row.ingredientId, {
        ingredientId: row.ingredientId,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
        dimension: targetDim,
        baseQuantity: base,
        displayUnit: row.defaultUnit,
        isStaple: row.isStaple,
        expiresOn: row.expiresOn,
      });
    }
  }

  return { byIngredientId, outOfStockStapleIds: new Set<string>() };
}

/** Deep clone so forward-simulation can deplete stock without mutating Stage A. */
export function cloneSnapshot(snapshot: PantrySnapshot): PantrySnapshot {
  const byIngredientId = new Map<string, PantryEntry>();
  for (const [id, entry] of snapshot.byIngredientId) {
    byIngredientId.set(id, { ...entry });
  }
  return { byIngredientId, outOfStockStapleIds: new Set(snapshot.outOfStockStapleIds) };
}

/** Entries sorted soonest-expiry first, for the planning prompt. */
export function pantryLinesByExpiry(snapshot: PantrySnapshot): PantryEntry[] {
  return [...snapshot.byIngredientId.values()].sort((a, b) => {
    if (a.expiresOn && b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn);
    if (a.expiresOn) return -1;
    if (b.expiresOn) return 1;
    return a.nameEn.localeCompare(b.nameEn);
  });
}
