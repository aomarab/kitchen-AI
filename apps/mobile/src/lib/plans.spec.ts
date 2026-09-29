import { describe, expect, it } from 'vitest';
import {
  planCookedStatValue,
  planProgress,
  planViewForScope,
  planWeekDays,
  shouldShowPlanDateColumn,
} from './plans';

const plan = {
  startsOn: '2026-09-28',
  entries: [
    { date: '2026-09-28', state: 'cooked' },
    { date: '2026-10-02', state: 'planned' },
    { date: '2026-10-05', state: 'cooked' },
  ],
} as const;

describe('planWeekDays', () => {
  it('moves to the next seven-day plan week at the boundary', () => {
    expect(planWeekDays(plan, '2026-10-04', '2026-10-02').map((day) => day.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);

    expect(planWeekDays(plan, '2026-10-05', '2026-10-02').map((day) => day.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('marks no planned days when the plan has no entries', () => {
    expect(
      planWeekDays({ startsOn: '2026-09-28', entries: [] }, '2026-09-30', '2026-09-30'),
    ).toEqual([
      { date: '2026-09-28', isToday: false, isSelected: false, planned: false },
      { date: '2026-09-29', isToday: false, isSelected: false, planned: false },
      { date: '2026-09-30', isToday: true, isSelected: true, planned: false },
      { date: '2026-10-01', isToday: false, isSelected: false, planned: false },
      { date: '2026-10-02', isToday: false, isSelected: false, planned: false },
      { date: '2026-10-03', isToday: false, isSelected: false, planned: false },
      { date: '2026-10-04', isToday: false, isSelected: false, planned: false },
    ]);
  });

  it('is locale independent and returns ISO dates only', () => {
    const days = planWeekDays(plan, '2026-10-01', '2026-10-02');

    expect(days.map((day) => day.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(days[3]).toMatchObject({ isSelected: true });
    expect(days[4]).toMatchObject({ isToday: true, planned: true });
  });
});

describe('planProgress', () => {
  it('counts cooked entries and exposes to-buy shortfalls when coverage has them', () => {
    expect(planProgress(plan, { coverageRatio: 0.5, shortfalls: [{}, {}] })).toEqual({
      cooked: 2,
      total: 3,
      toBuy: 2,
      cookedTileSpan: 1,
      coverageRatio: 0.5,
    });
  });

  describe('plan stat and row helpers', () => {
    it('renders the cooked stat value without repeating the total in the caption', () => {
      expect(planCookedStatValue('3', '21', 'of')).toBe('3 of 21');
      expect(planCookedStatValue('٣', '٢١', 'من')).toBe('٣ من ٢١');
    });

    it('shows the date column only on the first row for each day', () => {
      const entries = [
        { date: '2026-09-29', slot: 'breakfast' },
        { date: '2026-09-29', slot: 'lunch' },
        { date: '2026-09-30', slot: 'dinner' },
      ] as const;

      expect(entries.map((_, index) => shouldShowPlanDateColumn(entries, index))).toEqual([
        true,
        false,
        true,
      ]);
      expect(shouldShowPlanDateColumn(entries, -1)).toBe(false);
    });

    it('maps a generation scope back to the Plans segmented view', () => {
      expect(planViewForScope('daily')).toBe('day');
      expect(planViewForScope('weekly')).toBe('week');
      expect(planViewForScope('monthly')).toBe('month');
    });
  });

  it('hides to-buy and gives cooked the full row when coverage is absent or empty', () => {
    expect(planProgress(plan, undefined)).toMatchObject({ toBuy: null, cookedTileSpan: 2 });
    expect(planProgress(plan, { coverageRatio: 1, shortfalls: [] })).toMatchObject({
      toBuy: null,
      cookedTileSpan: 2,
    });
  });
});
