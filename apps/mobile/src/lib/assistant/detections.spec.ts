import { describe, expect, it } from 'vitest';
import { detectionsToSession } from './detections';
import type { DetectedItem } from './realtime-port';
import { buildInventoryInputs, initialReviewRows } from '../capture';
import type { StorageLocation } from '@kitchen/contracts';

const FRIDGE: StorageLocation = {
  id: 'loc-fridge',
  householdId: 'hh-1',
  name: 'Fridge',
  type: 'fridge',
};

const DETECTIONS: DetectedItem[] = [
  {
    id: 'd-tomato',
    nameEn: 'Tomato',
    nameAr: 'طماطم',
    quantity: 4,
    unit: 'piece',
    confidence: 0.92,
    category: 'vegetable',
  },
  {
    id: 'd-milk',
    nameEn: 'Milk',
    nameAr: 'حليب',
    quantity: 1,
    unit: 'l',
    confidence: 0.86,
    category: 'dairy',
  },
];

/** Confirm a detection the same way the UI does: session → rows → inputs. */
function confirm(detections: DetectedItem[]) {
  const session = detectionsToSession(detections);
  const rows = initialReviewRows(session, [FRIDGE]);
  return buildInventoryInputs(rows, 'assistant');
}

describe('detectionsToSession', () => {
  it('labels every added item as assistant-sourced', () => {
    const inputs = confirm(DETECTIONS);
    expect(inputs).toHaveLength(2);
    // The ledger is append-only, so provenance is permanent: an item the
    // assistant reported is not a photo nobody took.
    expect(inputs.map((i) => i.source)).toEqual(['assistant', 'assistant']);
  });

  it('carries both names and the category of every detection', () => {
    const inputs = confirm(DETECTIONS);
    // Unresolved rows create the globally shared catalog entry, so dropping the
    // Arabic name or the category files it wrong for every household forever.
    expect(inputs[0]).toMatchObject({
      rawName: 'Tomato',
      rawNameAr: 'طماطم',
      rawCategory: 'vegetable',
    });
    expect(inputs[1]).toMatchObject({
      rawName: 'Milk',
      rawNameAr: 'حليب',
      rawCategory: 'dairy',
    });
  });

  it('falls back to a quantity of one when the assistant cannot count', () => {
    const session = detectionsToSession([
      {
        id: 'd-rice',
        nameEn: 'Rice',
        nameAr: 'أرز',
        quantity: null,
        unit: 'g',
        confidence: 0.7,
        category: 'grain',
      },
    ]);
    // A zero-quantity row is filtered out and silently lost; one keeps it
    // editable so the user can correct the amount.
    expect(session.items[0]?.quantity).toBe(1);
  });

  it('produces an empty session from no detections', () => {
    const session = detectionsToSession([]);
    expect(session.items).toEqual([]);
    expect(session.emptyPhotoKeys).toEqual([]);
    // Nothing is written until the user confirms, and there is nothing to write.
    expect(confirm([])).toEqual([]);
  });

  it('marks every item unresolved so the API resolves the catalog on confirm', () => {
    const session = detectionsToSession(DETECTIONS);
    for (const item of session.items) {
      expect(item.match).toMatchObject({ ingredientId: null, strategy: 'created' });
      expect(item.photoKey).toBeNull();
      expect(item.suggestedLocationType).toBe('fridge');
    }
  });
});
