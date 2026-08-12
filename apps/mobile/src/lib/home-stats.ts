import { expiryStatus, type ExpiryStatus } from './expiry';

/**
 * Pure maths behind the home dashboard widgets.
 *
 * None of this touches React Native, so it is unit-testable — which matters
 * because the widgets are drawn with plain views and rotation rather than SVG
 * (the app ships no charting library and no `react-native-svg`, and adding a
 * native module would break every already-installed build until a rebuild).
 * The geometry therefore has to be right in the numbers, because there is no
 * render harness on mobile to catch it later.
 */

export interface LocatedItem {
  readonly locationId: string;
  readonly expiresAt: string | null;
}

export interface LocationSlice {
  /** `null` is the pooled remainder once the chart has run out of room. */
  readonly locationId: string | null;
  readonly count: number;
  readonly ratio: number;
}

/**
 * Donut charts stop being readable past a handful of slices, and households can
 * now create their own places, so the number of locations is unbounded.
 */
export const MAX_LOCATION_SLICES = 5;

export function locationSlices(
  items: readonly LocatedItem[],
  max: number = MAX_LOCATION_SLICES,
): LocationSlice[] {
  const total = items.length;
  if (total === 0) return [];

  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.locationId, (counts.get(item.locationId) ?? 0) + 1);
  }

  // Biggest first so the largest slice starts at twelve o'clock; the name is
  // the tie-break so the ring cannot reshuffle between two equal locations.
  const ranked = [...counts.entries()].sort(
    ([aId, aCount], [bId, bCount]) => bCount - aCount || aId.localeCompare(bId),
  );

  const slice = (locationId: string | null, count: number): LocationSlice => ({
    locationId,
    count,
    ratio: count / total,
  });

  // Pooling a single leftover would only rename it, so keep it as itself.
  if (ranked.length <= max) return ranked.map(([id, count]) => slice(id, count));

  const kept = ranked.slice(0, max - 1);
  const pooled = ranked.slice(max - 1).reduce((sum, [, count]) => sum + count, 0);
  return [...kept.map(([id, count]) => slice(id, count)), slice(null, pooled)];
}

/**
 * Which slice owns each tick of the ring, or `null` for the blank tick that
 * separates neighbours. Ticks are allocated by largest remainder so they add up
 * to exactly `tickCount` — the ring must close, whatever the percentages round
 * to — and every non-empty slice is guaranteed at least one tick so a 1% shelf
 * is never silently erased from a chart whose legend still lists it.
 */
export function ringTicks(ratios: readonly number[], tickCount: number): (number | null)[] {
  const ticks: (number | null)[] = Array(tickCount).fill(null);
  if (ratios.length === 0 || tickCount === 0) return ticks;

  const exact = ratios.map((ratio, index) => ({
    index,
    exact: ratio * tickCount,
  }));
  const shares = exact.map(({ exact: value }) => Math.floor(value));
  let remaining = tickCount - shares.reduce((sum, value) => sum + value, 0);

  const byRemainder = [...exact].sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.index - b.index);
  for (let i = 0; remaining > 0; i += 1, remaining -= 1) {
    const target = byRemainder[i % byRemainder.length];
    if (target) shares[target.index] = (shares[target.index] ?? 0) + 1;
  }

  // Rescue anything rounded down to nothing by taking from the largest slice.
  for (let index = 0; index < shares.length; index += 1) {
    if ((shares[index] ?? 0) !== 0 || (ratios[index] ?? 0) <= 0) continue;
    const donor = shares.indexOf(Math.max(...shares));
    const donorShare = shares[donor] ?? 0;
    if (donorShare > 1) {
      shares[donor] = donorShare - 1;
      shares[index] = 1;
    }
  }

  // One blank tick between neighbours reads as a segmented ring rather than a
  // pie. A lone slice needs no separator, and a slice too thin to spare a tick
  // keeps all of them — losing it would erase the slice.
  const separated = shares.length > 1;
  let cursor = 0;
  shares.forEach((share, index) => {
    const gap = separated && share >= 3 ? 1 : 0;
    for (let i = 0; i < share - gap; i += 1) ticks[cursor + i] = index;
    cursor += share;
  });

  return ticks;
}

export function freshnessCounts(
  items: readonly LocatedItem[],
  now: Date = new Date(),
): Record<ExpiryStatus, number> {
  const counts: Record<ExpiryStatus, number> = {
    expired: 0,
    today: 0,
    soon: 0,
    ok: 0,
    none: 0,
  };
  for (const item of items) counts[expiryStatus(item.expiresAt, now)] += 1;
  return counts;
}

export interface DayBar {
  readonly date: string;
  readonly planned: number;
  readonly cooked: number;
}

export interface PlannedMeal {
  readonly date: string;
  readonly state: 'planned' | 'cooked' | 'skipped';
}

/**
 * A fixed-width week starting today. The column count never changes with the
 * data, so the card reserves its height on first paint and nothing below it
 * shifts once meals load.
 */
export function weekBars(entries: readonly PlannedMeal[], today: string, days = 7): DayBar[] {
  const start = new Date(`${today}T00:00:00`);
  return Array.from({ length: days }, (_, offset) => {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate(),
    ).padStart(2, '0')}`;
    const forDay = entries.filter((entry) => entry.date === date);
    return {
      date,
      planned: forDay.length,
      cooked: forDay.filter((entry) => entry.state === 'cooked').length,
    };
  });
}
