import { describe, expect, it } from 'vitest';
import type { InventoryEventInput } from '@kitchen/contracts';
import {
  batchEvents,
  enqueue,
  makeInventoryEvent,
  pendingCount,
  resolveSynced,
} from '../lib/event-queue';

function event(clientEventId: string, delta = 1): InventoryEventInput {
  return {
    clientEventId,
    itemId: 'item-1',
    delta,
    unit: 'piece',
    reason: 'corrected',
    mealPlanEntryId: null,
    occurredAt: '2026-07-26T10:00:00.000Z',
  };
}

describe('makeInventoryEvent', () => {
  it('stamps a unique clientEventId and an occurredAt', () => {
    const a = makeInventoryEvent({ itemId: 'i', delta: -1, unit: 'piece', reason: 'consumed' });
    const b = makeInventoryEvent({ itemId: 'i', delta: -1, unit: 'piece', reason: 'consumed' });
    expect(a.clientEventId).not.toEqual(b.clientEventId);
    expect(a.occurredAt).toBeTruthy();
    expect(a.mealPlanEntryId).toBeNull();
  });

  it('preserves a caller-supplied occurredAt and meal plan link', () => {
    const e = makeInventoryEvent({
      itemId: 'i',
      delta: -2,
      unit: 'g',
      reason: 'consumed',
      mealPlanEntryId: 'entry-1',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    expect(e.occurredAt).toBe('2026-01-01T00:00:00.000Z');
    expect(e.mealPlanEntryId).toBe('entry-1');
  });
});

describe('enqueue', () => {
  it('appends new events', () => {
    const queue = enqueue([event('a')], event('b'));
    expect(queue.map((e) => e.clientEventId)).toEqual(['a', 'b']);
  });

  it('is idempotent on clientEventId (double-tap is a no-op)', () => {
    const queue = enqueue([event('a')], event('a'));
    expect(pendingCount(queue)).toBe(1);
  });
});

describe('resolveSynced — idempotent replay', () => {
  it('drops both applied and previously-skipped events', () => {
    const queue = [event('a'), event('b'), event('c')];
    const next = resolveSynced(queue, { applied: ['a'], skipped: ['b'] });
    expect(next.map((e) => e.clientEventId)).toEqual(['c']);
  });

  it('replaying an already-synced batch leaves the queue empty (no duplicates)', () => {
    const queue = [event('a'), event('b')];
    const first = resolveSynced(queue, { applied: ['a', 'b'], skipped: [] });
    // Server has already seen them; a re-sync reports them as skipped.
    const second = resolveSynced(first, { applied: [], skipped: ['a', 'b'] });
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(0);
  });
});

describe('batchEvents', () => {
  it('splits into chunks that respect the per-request cap', () => {
    const queue = Array.from({ length: 1200 }, (_, i) => event(`e-${i}`));
    const batches = batchEvents(queue, 500);
    expect(batches.map((b) => b.length)).toEqual([500, 500, 200]);
  });

  it('returns nothing for an empty queue', () => {
    expect(batchEvents([])).toEqual([]);
  });
});
