import { describe, expect, it } from 'vitest';
import type { RecognitionSession, RecognizedItem, StorageLocation } from '@kitchen/contracts';
import {
  LOW_CONFIDENCE,
  buildInventoryInputs,
  includedCount,
  initialReviewRows,
  isLowConfidence,
  pickLocationForType,
} from '../lib/capture';

function recognized(overrides: Partial<RecognizedItem> = {}): RecognizedItem {
  return {
    tempId: 'tmp-1',
    match: { ingredientId: 'ing-1', strategy: 'exact', confidence: 0.9, rawName: 'Tomato' },
    nameEn: 'Tomato',
    nameAr: 'طماطم',
    category: 'vegetable',
    quantity: 5,
    unit: 'piece',
    confidence: 0.9,
    suggestedExpiresAt: '2026-08-01',
    suggestedLocationType: 'fridge',
    photoKey: 'photo-1',
    ...overrides,
  };
}

const LOCATIONS: StorageLocation[] = [
  { id: 'loc-pantry', householdId: 'hh', name: 'Pantry', type: 'pantry' },
  { id: 'loc-fridge', householdId: 'hh', name: 'Fridge', type: 'fridge' },
];

function session(items: RecognizedItem[]): RecognitionSession {
  return { id: 'sess-1', items, emptyPhotoKeys: [], createdAt: '2026-07-26T10:00:00.000Z' };
}

describe('pickLocationForType', () => {
  it('matches by type, else falls back to the first location', () => {
    expect(pickLocationForType(LOCATIONS, 'fridge')).toBe('loc-fridge');
    expect(pickLocationForType(LOCATIONS, 'freezer')).toBe('loc-pantry');
    expect(pickLocationForType([], 'fridge')).toBe('');
  });
});

describe('isLowConfidence', () => {
  it('flags rows strictly below the threshold', () => {
    expect(isLowConfidence(LOW_CONFIDENCE - 0.01)).toBe(true);
    expect(isLowConfidence(LOW_CONFIDENCE)).toBe(false);
    expect(isLowConfidence(0.95)).toBe(false);
  });
});

describe('initialReviewRows', () => {
  it('includes every row by default and resolves the suggested location', () => {
    const rows = initialReviewRows(session([recognized()]), LOCATIONS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.include).toBe(true);
    expect(rows[0]!.locationId).toBe('loc-fridge');
    expect(rows[0]!.expiresAt).toBe('2026-08-01');
  });
});

describe('buildInventoryInputs — the only path into inventory (spec §5.1)', () => {
  it('never commits when nothing is included', () => {
    const rows = initialReviewRows(session([recognized()]), LOCATIONS).map((r) => ({
      ...r,
      include: false,
    }));
    expect(buildInventoryInputs(rows, 'photo')).toEqual([]);
    expect(includedCount(rows)).toBe(0);
  });

  it('commits only the kept rows, carrying the capture source through', () => {
    const rows = initialReviewRows(
      session([recognized(), recognized({ tempId: 'tmp-2', match: { ingredientId: 'ing-2', strategy: 'exact', confidence: 0.8, rawName: 'Onion' } })]),
      LOCATIONS,
    );
    rows[1]!.include = false;
    const inputs = buildInventoryInputs(rows, 'receipt');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.ingredientId).toBe('ing-1');
    expect(inputs[0]!.source).toBe('receipt');
    expect(inputs[0]!.locationId).toBe('loc-fridge');
  });

  it('drops rows with no resolved location', () => {
    const rows = initialReviewRows(session([recognized()]), []);
    expect(rows[0]!.locationId).toBe('');
    expect(buildInventoryInputs(rows, 'photo')).toEqual([]);
  });

  it('sends rawName instead of an id for unresolved matches', () => {
    const item = recognized({
      match: { ingredientId: null, strategy: 'unresolved', confidence: 0.3, rawName: 'Mystery herb' },
    });
    const rows = initialReviewRows(session([item]), LOCATIONS);
    const [input] = buildInventoryInputs(rows, 'photo');
    expect(input!.ingredientId).toBeNull();
    expect(input!.rawName).toBe('Mystery herb');
  });
});

describe('buildInventoryInputs carries what recognition identified', () => {
  const unmatched = recognized({
    match: { ingredientId: null, strategy: 'created', confidence: 0.7, rawName: 'Butter block' },
    nameEn: 'Butter block',
    nameAr: 'زبدة',
    category: 'dairy',
  });

  it('sends the category for a row with no catalog match, so it is not filed as "other"', () => {
    const rows = initialReviewRows(session([unmatched]), LOCATIONS);
    expect(buildInventoryInputs(rows, 'photo')[0]!.rawCategory).toBe('dairy');
  });

  it('omits it when the row already matched the catalog, which is already categorised', () => {
    const rows = initialReviewRows(session([recognized()]), LOCATIONS);
    expect(buildInventoryInputs(rows, 'photo')[0]!.rawCategory).toBeUndefined();
  });
});
