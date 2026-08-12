import { describe, it, expect } from 'vitest';
import {
  MAX_LOCATION_SLICES,
  freshnessCounts,
  locationSlices,
  ringTicks,
  weekBars,
} from './home-stats';

const item = (locationId: string, expiresAt: string | null = null) => ({
  locationId,
  expiresAt,
});

describe('locationSlices', () => {
  it('has nothing to draw for an empty kitchen', () => {
    expect(locationSlices([])).toEqual([]);
  });

  it('counts items per location and gives each its share', () => {
    const slices = locationSlices([item('fridge'), item('fridge'), item('pantry')]);
    expect(slices).toEqual([
      { locationId: 'fridge', count: 2, ratio: 2 / 3 },
      { locationId: 'pantry', count: 1, ratio: 1 / 3 },
    ]);
  });

  // A donut is unreadable past a handful of slices, and now that households can
  // add their own places there is no upper bound on how many exist.
  it('pools everything past the limit into one remainder slice', () => {
    const items = [
      item('a'),
      item('a'),
      item('a'),
      item('b'),
      item('b'),
      item('c'),
      item('d'),
      item('e'),
    ];
    const slices = locationSlices(items, 3);
    expect(slices).toHaveLength(3);
    expect(slices.slice(0, 2)).toEqual([
      { locationId: 'a', count: 3, ratio: 3 / 8 },
      { locationId: 'b', count: 2, ratio: 2 / 8 },
    ]);
    // c, d and e collapse together rather than three slivers.
    expect(slices[2]).toEqual({ locationId: null, count: 3, ratio: 3 / 8 });
  });

  it('never pools a single leftover, which would only rename it', () => {
    const slices = locationSlices([item('a'), item('a'), item('b')], 2);
    expect(slices).toEqual([
      { locationId: 'a', count: 2, ratio: 2 / 3 },
      { locationId: 'b', count: 1, ratio: 1 / 3 },
    ]);
  });

  it('puts the biggest slice first, so it starts at twelve o clock', () => {
    const slices = locationSlices([item('small'), item('big'), item('big')]);
    expect(slices[0]?.locationId).toBe('big');
  });

  it('breaks ties by name so the chart does not reshuffle between renders', () => {
    const first = locationSlices([item('b'), item('a')]).map((s) => s.locationId);
    const second = locationSlices([item('a'), item('b')]).map((s) => s.locationId);
    expect(first).toEqual(second);
  });

  it('defaults to a readable number of slices', () => {
    expect(MAX_LOCATION_SLICES).toBeLessThanOrEqual(5);
  });
});

describe('ringTicks', () => {
  it('draws nothing when there is nothing to show', () => {
    expect(ringTicks([], 12)).toEqual(Array(12).fill(null));
  });

  it('gives every tick to a single full slice, with no gap to break the ring', () => {
    expect(ringTicks([1], 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('splits evenly and separates the slices with one blank tick each', () => {
    const ticks = ringTicks([0.5, 0.5], 12);
    expect(ticks.filter((t) => t === 0)).toHaveLength(5);
    expect(ticks.filter((t) => t === 1)).toHaveLength(5);
    expect(ticks.filter((t) => t === null)).toHaveLength(2);
  });

  it('always uses the whole ring, however the percentages round', () => {
    const ticks = ringTicks([1 / 3, 1 / 3, 1 / 3], 50);
    expect(ticks).toHaveLength(50);
    // Thirds of 50 do not divide. Only the three separators may be blank —
    // ticks lost to rounding would otherwise pile up as a dead wedge at the
    // end of the ring, and the circle would visibly fail to close.
    expect(ticks.filter((tick) => tick === null)).toHaveLength(3);
  });

  it('keeps slices in order around the ring', () => {
    const ticks = ringTicks([0.6, 0.4], 20).filter((t): t is number => t !== null);
    const firstOfSecond = ticks.indexOf(1);
    expect(ticks.slice(0, firstOfSecond).every((t) => t === 0)).toBe(true);
  });

  // Rounding a 1% category to zero ticks would delete it from the picture while
  // the legend still lists it — the chart would be lying about the kitchen.
  it('never rounds a real slice away to nothing', () => {
    const ticks = ringTicks([0.97, 0.02, 0.01], 40);
    expect(ticks).toContain(1);
    expect(ticks).toContain(2);
  });

  it('does not blank out a slice too small to survive losing a tick', () => {
    const ticks = ringTicks([0.95, 0.05], 20);
    expect(ticks.filter((t) => t === 1).length).toBeGreaterThan(0);
  });
});

describe('freshnessCounts', () => {
  const now = new Date('2026-08-12T09:00:00');

  it('sorts a shelf into what is gone, what is urgent and what can wait', () => {
    const counts = freshnessCounts(
      [
        item('a', '2026-08-10'),
        item('a', '2026-08-12'),
        item('a', '2026-08-14'),
        item('a', '2026-08-30'),
        item('a', null),
      ],
      now,
    );
    expect(counts).toEqual({ expired: 1, today: 1, soon: 1, ok: 1, none: 1 });
  });

  it('counts nothing for an empty kitchen', () => {
    expect(freshnessCounts([], now)).toEqual({
      expired: 0,
      today: 0,
      soon: 0,
      ok: 0,
      none: 0,
    });
  });
});

describe('weekBars', () => {
  const entries = [
    { date: '2026-08-12', state: 'cooked' as const },
    { date: '2026-08-12', state: 'planned' as const },
    { date: '2026-08-13', state: 'planned' as const },
    { date: '2026-08-20', state: 'planned' as const },
    { date: '2026-08-01', state: 'cooked' as const },
  ];

  it('always returns the same seven columns, so the row cannot jump about', () => {
    const bars = weekBars(entries, '2026-08-12');
    expect(bars).toHaveLength(7);
    expect(bars[0]?.date).toBe('2026-08-12');
    expect(bars[6]?.date).toBe('2026-08-18');
  });

  it('counts what is planned and how much of it is cooked', () => {
    const bars = weekBars(entries, '2026-08-12');
    expect(bars[0]).toEqual({ date: '2026-08-12', planned: 2, cooked: 1 });
    expect(bars[1]).toEqual({ date: '2026-08-13', planned: 1, cooked: 0 });
  });

  it('ignores meals outside the window in both directions', () => {
    const bars = weekBars(entries, '2026-08-12');
    expect(bars.reduce((sum, bar) => sum + bar.planned, 0)).toBe(3);
  });

  it('crosses a month boundary correctly', () => {
    const bars = weekBars([], '2026-08-29');
    expect(bars[3]?.date).toBe('2026-09-01');
  });

  it('is empty-safe', () => {
    expect(weekBars([], '2026-08-12').every((bar) => bar.planned === 0)).toBe(true);
  });

  it('accounts for every entry when anchored on the plan start, including past days', () => {
    // The Home card shows "N of M cooked this week" above these bars. If the
    // bars were anchored on today they would silently drop the days of the plan
    // that have already been and gone, and the two would disagree on screen.
    const plan = [
      { date: '2026-08-10', state: 'cooked' as const },
      { date: '2026-08-11', state: 'cooked' as const },
      { date: '2026-08-12', state: 'planned' as const },
      { date: '2026-08-16', state: 'planned' as const },
    ];
    const bars = weekBars(plan, '2026-08-10');
    expect(bars.reduce((sum, bar) => sum + bar.planned, 0)).toBe(plan.length);
    expect(bars.reduce((sum, bar) => sum + bar.cooked, 0)).toBe(2);
  });
});
