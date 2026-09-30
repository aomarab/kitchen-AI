import { describe, expect, it } from 'vitest';
import type { InventoryItem, StorageLocation } from '@kitchen/contracts';
import { createTranslator } from '@kitchen/i18n';
import {
  EXPIRY_TONE,
  justAdded,
  parseSection,
  parseSort,
  placeCaption,
  placeTint,
  rankPlaces,
  useFirst,
} from './kitchen';

const NOW = new Date('2026-07-26T12:00:00');

function location(
  id: string,
  type: StorageLocation['type'] = 'other',
  name: string = type,
): StorageLocation {
  return { id, householdId: 'h', type, name };
}

function item(id: string, locationId: string, expiresAt: string | null = null, createdAt = id) {
  return {
    id,
    locationId,
    expiresAt,
    createdAt: `2026-07-${createdAt.padStart(2, '0')}T08:00:00.000Z`,
  } as InventoryItem;
}

describe('rankPlaces', () => {
  it('includes zero-count places', () => {
    expect(rankPlaces([], [location('a'), location('b')], (loc) => loc.id)).toEqual([
      { location: location('a'), count: 0, soon: 0 },
      { location: location('b'), count: 0, soon: 0 },
    ]);
  });

  it('sorts by count descending', () => {
    const ranked = rankPlaces(
      [item('1', 'b'), item('2', 'b'), item('3', 'a')],
      [location('a'), location('b'), location('c')],
      (loc) => loc.id,
    );
    expect(ranked.map((place) => place.location.id)).toEqual(['b', 'a', 'c']);
  });

  it('uses the localised label and then id as stable tie-breaks', () => {
    const ranked = rankPlaces(
      [item('1', 'z'), item('2', 'a'), item('3', 'b')],
      [
        location('z', 'other', 'Beta'),
        location('b', 'other', 'Alpha'),
        location('a', 'other', 'Alpha'),
      ],
      (loc) => loc.name,
    );
    expect(ranked.map((place) => place.location.id)).toEqual(['a', 'b', 'z']);
  });

  it('counts only items expiring soon for the soon badge', () => {
    const ranked = rankPlaces(
      [
        item('1', 'a', '2026-07-24'),
        item('2', 'a', '2026-07-26'),
        item('3', 'a', '2026-07-29'),
        item('4', 'a', '2026-07-30'),
        item('5', 'a', null),
      ],
      [location('a')],
      (loc) => loc.id,
      NOW,
    );
    expect(ranked[0]).toMatchObject({ count: 5, soon: 3 });
  });

  it('ignores items whose location is unknown', () => {
    const ranked = rankPlaces(
      [item('1', 'a'), item('2', 'missing')],
      [location('a'), location('b')],
      (loc) => loc.id,
    );
    expect(ranked.map((place) => [place.location.id, place.count])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
  });
});

describe('placeTint', () => {
  it('rotates butter, sage and apricot from rank 0', () => {
    expect(Array.from({ length: 7 }, (_, rank) => placeTint(rank))).toEqual([
      'butter',
      'sage',
      'apricot',
      'butter',
      'sage',
      'apricot',
      'butter',
    ]);
  });
});

describe('useFirst', () => {
  it('returns at most six expired, due-today or soon items in urgency order', () => {
    const result = useFirst(
      [
        item('1', 'a', '2026-07-27'),
        item('2', 'a', '2026-07-24'),
        item('3', 'a', null),
        item('4', 'a', '2026-07-26'),
        item('5', 'a', '2026-07-29'),
        item('6', 'a', '2026-08-02'),
        item('7', 'a', '2026-07-28'),
        item('8', 'a', '2026-07-25'),
        item('9', 'a', '2026-07-23'),
        item('10', 'a', '2026-07-29'),
      ],
      NOW,
    );
    expect(result.map((it) => it.id)).toEqual(['9', '2', '8', '4', '1', '7']);
  });
});

describe('justAdded', () => {
  it('returns at most six items by createdAt descending', () => {
    const result = justAdded([
      item('1', 'a', null, '21'),
      item('2', 'a', null, '25'),
      item('3', 'a', null, '20'),
      item('4', 'a', null, '19'),
      item('5', 'a', null, '18'),
      item('6', 'a', null, '17'),
      item('7', 'a', null, '16'),
    ]);
    expect(result.map((it) => it.id)).toEqual(['2', '1', '3', '4', '5', '6']);
  });
});

describe('parseSort', () => {
  it.each(['expiry', 'name', 'recent'] as const)('accepts %s', (value) => {
    expect(parseSort(value)).toBe(value);
  });

  it('rejects invalid values and arrays', () => {
    expect(parseSort('location')).toBeUndefined();
    expect(parseSort(['expiry'])).toBeUndefined();
    expect(parseSort(undefined)).toBeUndefined();
  });
});

describe('parseSection', () => {
  it('accepts justAdded and rejects everything else', () => {
    expect(parseSection('justAdded')).toBe('justAdded');
    expect(parseSection('useFirst')).toBeUndefined();
    expect(parseSection(['justAdded'])).toBeUndefined();
  });
});

describe('EXPIRY_TONE', () => {
  it('keeps the existing status-to-badge-tone mapping', () => {
    expect(EXPIRY_TONE).toEqual({
      expired: 'danger',
      today: 'danger',
      soon: 'warn',
      ok: 'success',
      none: 'neutral',
    });
  });
});

describe('placeCaption', () => {
  const t = createTranslator('en');

  it('uses the built-in type caption for seeded and blank names', () => {
    expect(placeCaption(t, location('a', 'fridge', 'Fridge'))).toBe('in the fridge');
    expect(placeCaption(t, location('b', 'pantry', '   '))).toBe('in the pantry');
  });

  it('uses the custom place caption for a renamed place', () => {
    expect(placeCaption(t, location('a', 'fridge', 'Garage shelf'))).toBe('in Garage shelf');
  });
});
