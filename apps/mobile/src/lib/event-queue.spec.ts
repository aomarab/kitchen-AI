import { describe, expect, it } from 'vitest';
import type { InventoryEventInput } from '@kitchen/contracts';
import {
  batchEvents,
  enqueue,
  makeInventoryEvent,
  ownedBy,
  pendingCount,
  resolveSynced,
  type QueuedEvent,
  type QueueOwner,
} from '../lib/event-queue';

const ALICE: QueueOwner = { userId: 'user-alice', householdId: 'hh-1' };
const BOB: QueueOwner = { userId: 'user-bob', householdId: 'hh-1' };

function rawEvent(clientEventId: string, delta = 1): InventoryEventInput {
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

function event(clientEventId: string, owner: QueueOwner = ALICE): QueuedEvent {
  return { ...owner, event: rawEvent(clientEventId) };
}

const ids = (entries: readonly QueuedEvent[]): string[] =>
  entries.map((e) => e.event.clientEventId);

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
    expect(ids(queue)).toEqual(['a', 'b']);
  });

  it('is idempotent on clientEventId (double-tap is a no-op)', () => {
    const queue = enqueue([event('a')], event('a'));
    expect(pendingCount(queue)).toBe(1);
  });
});

describe('resolveSynced — three-way reconciliation', () => {
  const noRejections = { rejected: [] as { clientEventId: string; reason: 'item_not_found' }[] };

  it('drops applied and duplicate events, keeps the rest pending', () => {
    const queue = [event('a'), event('b'), event('c')];
    const { pending, rejected } = resolveSynced(queue, {
      applied: ['a'],
      duplicate: ['b'],
      ...noRejections,
    });
    expect(ids(pending)).toEqual(['c']);
    expect(rejected).toEqual([]);
  });

  it('replaying an already-synced batch leaves the queue empty (no duplicates)', () => {
    const queue = [event('a'), event('b')];
    const first = resolveSynced(queue, { applied: ['a', 'b'], duplicate: [], ...noRejections });
    // Server has already seen them; a re-sync reports them as duplicates, not applied.
    const second = resolveSynced(first.pending, {
      applied: [],
      duplicate: ['a', 'b'],
      ...noRejections,
    });
    expect(first.pending).toHaveLength(0);
    expect(second.pending).toHaveLength(0);
    expect(first.rejected).toEqual([]);
  });

  it('never silently drops a rejected event — it is surfaced, not treated as applied', () => {
    const queue = [event('a'), event('b'), event('c')];
    const { pending, rejected } = resolveSynced(queue, {
      applied: ['a'],
      duplicate: [],
      rejected: [{ clientEventId: 'b', reason: 'item_not_found' }],
    });
    // 'b' is gone from the retry queue (retrying can never succeed)...
    expect(ids(pending)).toEqual(['c']);
    // ...but it is surfaced with its reason and the original event, not lost.
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.event.clientEventId).toBe('b');
    expect(rejected[0]!.reason).toBe('item_not_found');
  });

  it('carries every rejection reason through for the user to see', () => {
    const queue = [event('x'), event('y')];
    const { pending, rejected } = resolveSynced(queue, {
      applied: [],
      duplicate: [],
      rejected: [
        { clientEventId: 'x', reason: 'incompatible_unit' },
        { clientEventId: 'y', reason: 'invalid_event' },
      ],
    });
    expect(pending).toHaveLength(0);
    expect(rejected.map((r) => r.reason)).toEqual(['incompatible_unit', 'invalid_event']);
  });
});

describe('batchEvents', () => {
  it('splits into chunks that respect the per-request cap', () => {
    const queue = Array.from({ length: 1200 }, (_, i) => event(`e-${i}`));
    const batches = batchEvents(queue, 500);
    expect(batches.map((b) => b.length)).toEqual([500, 500, 200]);
  });

  it('sends the wire event, not the local envelope', () => {
    const [batch] = batchEvents([event('a')]);
    expect(batch?.[0]).toEqual(rawEvent('a'));
    expect(batch?.[0]).not.toHaveProperty('userId');
  });

  it('returns nothing for an empty queue', () => {
    expect(batchEvents([])).toEqual([]);
  });
});

/**
 * The queue is durable and outlives sign-out, and the server takes the actor
 * and household from the caller's credentials — so an entry replayed by the
 * wrong session would be silently written into someone else's ledger.
 */
describe('queue ownership on a shared device', () => {
  it('replays only the signed-in user\u2019s own events', () => {
    const queue = [event('a', ALICE), event('b', BOB), event('c', ALICE)];
    expect(ids(ownedBy(queue, ALICE))).toEqual(['a', 'c']);
    expect(ids(ownedBy(queue, BOB))).toEqual(['b']);
  });

  it('does not replay events queued for a different household', () => {
    const queue = [event('a', ALICE)];
    expect(ownedBy(queue, { userId: ALICE.userId, householdId: 'hh-2' })).toEqual([]);
  });

  it('keeps the other member\u2019s events queued rather than discarding them', () => {
    const queue = [event('a', ALICE), event('b', BOB)];
    // Alice syncs; Bob's event is untouched and still waiting for Bob.
    const { pending } = resolveSynced(queue, {
      applied: ['a'],
      duplicate: [],
      rejected: [],
    });
    expect(ids(pending)).toEqual(['b']);
    expect(ids(ownedBy(pending, BOB))).toEqual(['b']);
  });

  it('carries ownership through to a rejection so it is shown to the right person', () => {
    const { rejected } = resolveSynced([event('a', BOB)], {
      applied: [],
      duplicate: [],
      rejected: [{ clientEventId: 'a', reason: 'item_not_found' }],
    });
    expect(rejected[0]).toMatchObject({ userId: BOB.userId, householdId: BOB.householdId });
    expect(ownedBy(rejected, ALICE)).toEqual([]);
  });
});
