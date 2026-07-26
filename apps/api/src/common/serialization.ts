/**
 * Shared helpers for turning raw Drizzle rows into the JSON shapes the
 * `@kitchen/contracts` schemas expect. `postgres-js` returns `numeric` columns
 * as strings and `timestamp` columns as `Date`s, so every serializer normalizes
 * those here rather than repeating the conversions.
 */

export function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

export function toNullableNumber(value: string | number | null): number | null {
  return value === null ? null : toNumber(value);
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Round to the 3 decimal places our `numeric(_, 3)` columns store. */
export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Drizzle `numeric` columns are written as strings. */
export function numeric(value: number): string {
  return String(round3(value));
}
