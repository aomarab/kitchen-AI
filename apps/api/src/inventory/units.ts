import { UNIT_DIMENSION, type Unit } from '@kitchen/contracts';

/**
 * Conversion factor to each dimension's base unit (g for mass, ml for volume,
 * piece for count). Count units share a factor of 1: the schema treats them as
 * one dimension, so merging different count units is intentionally 1:1.
 */
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

export function areCompatible(a: Unit, b: Unit): boolean {
  return UNIT_DIMENSION[a] === UNIT_DIMENSION[b];
}

/**
 * Convert a quantity between units in the same dimension. Returns `null` when
 * the dimensions differ (an incompatible unit), which callers surface as
 * `VALIDATION_FAILED`.
 */
export function convertQuantity(quantity: number, from: Unit, to: Unit): number | null {
  if (!areCompatible(from, to)) return null;
  if (from === to) return quantity;
  return (quantity * TO_BASE[from]) / TO_BASE[to];
}
