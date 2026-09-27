import { describe, expect, it } from 'vitest';
import {
  dayPart,
  firstName,
  pantryLine,
  tonightEntry,
  useSoonLabel,
  useSoonPreview,
  weekProgress,
} from './home';

describe('dayPart', () => {
  it.each([
    ['04:59', 'night'],
    ['05:00', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['16:59', 'afternoon'],
    ['17:00', 'evening'],
    ['21:59', 'evening'],
    ['22:00', 'night'],
    ['00:00', 'night'],
  ] as const)('returns %s as %s', (time, expected) => {
    expect(dayPart(new Date(`2026-09-27T${time}:00`))).toBe(expected);
  });
});

describe('firstName', () => {
  it.each([
    ['Layla Haddad', 'Layla'],
    ['  Layla  ', 'Layla'],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    ['ليلى حداد', 'ليلى'],
  ] as const)('extracts the first usable token from %s', (input, expected) => {
    expect(firstName(input)).toBe(expected);
  });
});

describe('tonightEntry', () => {
  const today = '2026-09-27';
  const breakfast = { id: 'breakfast', date: today, slot: 'breakfast' };
  const lunch = { id: 'lunch', date: today, slot: 'lunch' };
  const dinner = { id: 'dinner', date: today, slot: 'dinner' };

  it('prefers dinner when today has one', () => {
    expect(tonightEntry([breakfast, dinner], today)).toBe(dinner);
  });

  it("falls back to today's first entry", () => {
    expect(tonightEntry([lunch, breakfast], today)).toBe(lunch);
  });

  it('returns undefined with no entry today', () => {
    expect(
      tonightEntry([{ id: 'other', date: '2026-09-28', slot: 'dinner' }], today),
    ).toBeUndefined();
  });

  it("ignores another day's dinner", () => {
    expect(
      tonightEntry([{ id: 'other', date: '2026-09-28', slot: 'dinner' }, breakfast], today),
    ).toBe(breakfast);
  });
});

describe('pantryLine', () => {
  it('counts required ingredients that are in stock', () => {
    expect(
      pantryLine(
        {
          ingredients: [
            { optional: false, inStock: true },
            { inStock: true },
            { optional: true, inStock: true },
            { optional: false, inStock: false },
          ],
        },
        false,
      ),
    ).toEqual({ key: 'usesYourItems', count: 2 });
  });

  it('uses the loaded recipe even when the count is zero', () => {
    expect(
      pantryLine(
        {
          ingredients: [
            { optional: false, inStock: false },
            { optional: true, inStock: true },
          ],
        },
        true,
      ),
    ).toEqual({ key: 'usesYourItems', count: 0 });
  });

  it('falls back to the fully-covered plan entry while the recipe is missing', () => {
    expect(pantryLine(undefined, true)).toEqual({ key: 'allInKitchen' });
  });

  it('returns no line when neither recipe nor coverage can prove the pantry state', () => {
    expect(pantryLine(undefined, false)).toBeNull();
  });
});

describe('useSoonPreview', () => {
  it('keeps the query order and caps the preview at three items', () => {
    expect(useSoonPreview(['tomato', 'spinach', 'milk', 'eggs'])).toEqual([
      'tomato',
      'spinach',
      'milk',
    ]);
  });
});

describe('useSoonLabel', () => {
  it('names the heading, count and each shown item with its days', () => {
    expect(
      useSoonLabel({
        heading: 'Use soon',
        countLabel: '4 items',
        items: [
          { name: 'Tomatoes', expiryLabel: '1 day' },
          { name: 'Spinach', expiryLabel: '2 days' },
          { name: 'Milk', expiryLabel: '3 days' },
        ],
      }),
    ).toBe('Use soon, 4 items: Tomatoes, 1 day; Spinach, 2 days; Milk, 3 days');
  });

  it('uses the empty sentence when there are no expiring items', () => {
    expect(
      useSoonLabel({
        heading: 'Use soon',
        emptyLabel: 'Nothing is expiring soon.',
        items: [],
      }),
    ).toBe('Use soon, Nothing is expiring soon.');
  });
});

describe('weekProgress', () => {
  it('derives cooked and total counts from the plan week', () => {
    expect(
      weekProgress({
        startsOn: '2026-09-21',
        entries: [
          { date: '2026-09-21', state: 'cooked' },
          { date: '2026-09-21', state: 'planned' },
          { date: '2026-09-22', state: 'skipped' },
          { date: '2026-09-30', state: 'cooked' },
        ],
      }),
    ).toEqual({ cooked: 1, total: 3 });
  });

  it('keeps the existing null rule when the week has no planned meals', () => {
    expect(weekProgress({ startsOn: '2026-09-21', entries: [] })).toBeNull();
    expect(weekProgress(null)).toBeNull();
  });
});
