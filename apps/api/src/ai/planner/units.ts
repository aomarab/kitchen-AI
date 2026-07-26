import { UNIT_DIMENSION, type Unit } from '@kitchen/contracts';

/**
 * Coverage math for Stage C. Quantities are converted to a per-dimension base
 * unit before comparison. Cross-dimension comparisons are impossible (you cannot
 * prove grams of rice cover a "piece"), so callers treat those as uncovered.
 *
 * Count units (piece, clove, can, bunch…) are treated as interchangeable whole
 * units — a deliberate simplification, since the catalog gives each ingredient a
 * single default count unit that both recipes and inventory use.
 */

export type Dimension = 'mass' | 'volume' | 'count';

const TO_BASE: Record<Unit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  pinch: 0.31,
  piece: 1,
  bunch: 1,
  clove: 1,
  slice: 1,
  can: 1,
  jar: 1,
  packet: 1,
  bottle: 1,
};

export function dimensionOf(unit: Unit): Dimension {
  return UNIT_DIMENSION[unit];
}

/** Quantity expressed in the base unit of its dimension (g, ml or whole units). */
export function toBase(quantity: number, unit: Unit): number {
  return quantity * TO_BASE[unit];
}

/** Convert a base-unit quantity back into `unit`. */
export function fromBase(baseQuantity: number, unit: Unit): number {
  return baseQuantity / TO_BASE[unit];
}

/**
 * Convert `quantity` from one unit to another, or `null` when the units are in
 * different dimensions and therefore not comparable.
 */
export function convert(quantity: number, from: Unit, to: Unit): number | null {
  if (dimensionOf(from) !== dimensionOf(to)) return null;
  return (quantity * TO_BASE[from]) / TO_BASE[to];
}
