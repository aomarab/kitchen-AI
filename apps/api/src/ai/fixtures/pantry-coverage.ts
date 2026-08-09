import type { Unit } from '@kitchen/contracts';
import { dimensionOf, fromBase, toBase, type Dimension } from '../planner/units.js';
import type { PantryLine } from '../prompts/prompt.types.js';
import { STAPLE_INGREDIENT_NAMES, type RecipeTemplate } from './recipe-templates.js';

/**
 * Pantry coverage for the mock planner. This mirrors the deterministic Stage-C
 * validator (`planner/validation.ts`) closely enough that a template the mock
 * calls "covered" is one Stage C will accept: optional ingredients are ignored,
 * catalog staples are assumed on hand, and every other required ingredient must
 * be present in a compatible dimension and sufficient quantity. The
 * quantity/dimension arithmetic is reused from `planner/units.ts` — there is no
 * second notion of coverage here.
 */

const EPSILON = 1e-6;

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** True when a name is a catalog staple Stage C assumes is always available. */
export function isStapleName(name: string): boolean {
  return STAPLE_INGREDIENT_NAMES.has(normalizeName(name));
}

/** One depletable line of the working pantry, keyed by canonical English name. */
export interface StockLine {
  key: string;
  nameEn: string;
  nameAr: string;
  /** Name in the plan's active locale, for prompt/synthesis text. */
  displayName: string;
  unit: Unit;
  dimension: Dimension;
  baseRemaining: number;
  isStaple: boolean;
  expiresOn: string | null;
}

/**
 * Mutable working stock the mock depletes as it assigns recipes, so later slots
 * and days correctly see reduced quantities (forward-simulation, spec §5.4).
 */
export type WorkingStock = Map<string, StockLine>;

/** Build a working stock from the pantry lines the prompt context carries. */
export function buildStock(pantry: PantryLine[]): WorkingStock {
  const stock: WorkingStock = new Map();
  for (const line of pantry) {
    const key = normalizeName(line.nameEn);
    const dimension = dimensionOf(line.unit as Unit);
    const base = toBase(line.quantity, line.unit as Unit);
    const existing = stock.get(key);
    if (existing) {
      if (existing.dimension === dimension) existing.baseRemaining += base;
      continue;
    }
    stock.set(key, {
      key,
      nameEn: line.nameEn,
      nameAr: line.nameAr,
      displayName: line.name,
      unit: line.unit as Unit,
      dimension,
      baseRemaining: base,
      isStaple: line.isStaple,
      expiresOn: line.expiresOn,
    });
  }
  return stock;
}

/** Available base-unit quantity for a name in the given dimension, else 0. */
function availableBase(stock: WorkingStock, name: string, unit: Unit): number {
  const line = stock.get(normalizeName(name));
  if (!line || line.dimension !== dimensionOf(unit)) return 0;
  return line.baseRemaining;
}

/**
 * True when every required, non-staple ingredient of the template is available
 * in enough quantity given the current working stock.
 */
export function isCovered(template: RecipeTemplate, stock: WorkingStock): boolean {
  for (const ing of template.ingredients) {
    if (ing.optional || isStapleName(ing.name)) continue;
    const needBase = toBase(ing.quantity, ing.unit);
    if (needBase > availableBase(stock, ing.name, ing.unit) + EPSILON) return false;
  }
  return true;
}

/** Deplete a single line by `quantity` of `unit` (mirrors applyConsumption). */
export function consume(stock: WorkingStock, name: string, quantity: number, unit: Unit): void {
  const line = stock.get(normalizeName(name));
  if (!line || line.dimension !== dimensionOf(unit)) return;
  line.baseRemaining = Math.max(0, line.baseRemaining - toBase(quantity, unit));
}

/** Deplete the working stock by everything a chosen template consumes. */
export function consumeTemplate(template: RecipeTemplate, stock: WorkingStock): void {
  for (const ing of template.ingredients) {
    if (ing.optional) continue;
    consume(stock, ing.name, ing.quantity, ing.unit);
  }
}

/** Remaining quantity of a line expressed in its own display unit. */
export function remainingInUnit(line: StockLine): number {
  return fromBase(line.baseRemaining, line.unit);
}
