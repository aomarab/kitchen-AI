import { describe, expect, it } from 'vitest';
import type { InventoryEvent, InventoryEventReason, Unit } from '@kitchen/contracts';
import { itemHistory } from './inventory-history';

function event(
  id: string,
  itemId: string,
  createdAt: string,
  delta = 1,
  reason: InventoryEventReason = 'added',
  unit: Unit = 'piece',
): InventoryEvent {
  return {
    id,
    itemId,
    householdId: '00000000-0000-4000-8000-000000000001',
    delta,
    unit,
    reason,
    mealPlanEntryId: null,
    actorUserId: null,
    createdAt,
  };
}

describe('itemHistory', () => {
  it('keeps only the requested item events newest first', () => {
    const events = [
      event('b', 'item-1', '2026-09-26T10:00:00.000Z', 2),
      event('c', 'item-2', '2026-09-28T10:00:00.000Z', -1, 'consumed'),
      event('a', 'item-1', '2026-09-28T09:00:00.000Z', -1, 'consumed'),
    ];

    expect(itemHistory(events, 'item-1').map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('breaks equal timestamps by id without mutating the source array', () => {
    const events = [
      event('c', 'item-1', '2026-09-28T10:00:00.000Z'),
      event('a', 'item-1', '2026-09-28T10:00:00.000Z'),
      event('b', 'item-1', '2026-09-28T10:00:00.000Z'),
    ];

    expect(itemHistory(events, 'item-1').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(events.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns an empty list when the item has no events', () => {
    expect(itemHistory([event('a', 'item-1', '2026-09-28T10:00:00.000Z')], 'item-2')).toEqual([]);
  });
});
