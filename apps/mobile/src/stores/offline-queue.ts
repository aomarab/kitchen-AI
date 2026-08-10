import { create } from 'zustand';
import type { SyncEventsResponse } from '@kitchen/contracts';
import {
  enqueue,
  makeInventoryEvent,
  ownedBy,
  resolveSynced,
  type MakeEventParams,
  type QueuedEvent,
  type QueueOwner,
  type RejectedEvent,
} from '../lib/event-queue';
import { readJson, writeJson, removeJson } from '../lib/storage';

const PERSIST_KEY = 'offline_events';

interface PersistShape {
  events: QueuedEvent[];
  rejected: RejectedEvent[];
}

interface OfflineQueueState {
  events: QueuedEvent[];
  /** Events the server refused; surfaced to the user, never silently dropped. */
  rejected: RejectedEvent[];
  /** Build an inventory event and append it to the durable queue. */
  enqueue: (owner: QueueOwner, params: MakeEventParams) => QueuedEvent;
  /**
   * Reconcile the queue against a sync response: drop committed events, keep the
   * rest pending, and move rejected events into the visible `rejected` list.
   */
  resolve: (response: Pick<SyncEventsResponse, 'applied' | 'duplicate' | 'rejected'>) => void;
  /** Acknowledge and clear a surfaced sync failure. */
  dismissRejected: (clientEventId: string) => void;
  /**
   * Empty the queue in memory *and* on disk. Sign-out deliberately keeps queued
   * events (the same user returns), but account deletion must drop them: the
   * account is gone, so replaying its writes on reconnect would hit a dead
   * account — or attach to whoever signs in next on this device.
   */
  clear: () => Promise<void>;
  hydrate: () => Promise<void>;
}

/**
 * Durable offline write queue. Every inventory mutation is recorded as an event
 * with a client id so replay through `syncInventoryEvents` is idempotent
 * (spec §9). The queue survives app restarts via the JSON store.
 *
 * Entries carry the user and household that produced them. The queue outliving
 * sign-out is deliberate — an unsynced write must not vanish because someone
 * signed out on a plane — so it is the flush that filters by the current
 * session, not sign-out that erases it. See {@link QueuedEvent}.
 */
export const useOfflineQueue = create<OfflineQueueState>((set, get) => ({
  events: [],
  rejected: [],

  enqueue: (owner, params) => {
    const entry: QueuedEvent = { ...owner, event: makeInventoryEvent(params) };
    const events = enqueue(get().events, entry);
    set({ events });
    persist(events, get().rejected);
    return entry;
  },

  resolve: (response) => {
    const { pending, rejected } = resolveSynced(get().events, response);
    const seen = new Set(get().rejected.map((r) => r.event.clientEventId));
    const merged = [...get().rejected, ...rejected.filter((r) => !seen.has(r.event.clientEventId))];
    set({ events: pending, rejected: merged });
    persist(pending, merged);
  },

  dismissRejected: (clientEventId) => {
    const rejected = get().rejected.filter((r) => r.event.clientEventId !== clientEventId);
    set({ rejected });
    persist(get().events, rejected);
  },

  clear: async () => {
    set({ events: [], rejected: [] });
    await removeJson(PERSIST_KEY);
  },

  hydrate: async () => {
    const saved = await readJson<PersistShape>(PERSIST_KEY);
    // Entries persisted before events carried an owner cannot be attributed to
    // anyone, and replaying them under a guessed identity is worse than losing
    // them, so they are dropped rather than adopted by whoever signs in next.
    set({
      events: Array.isArray(saved?.events) ? saved.events.filter(isOwned) : [],
      rejected: Array.isArray(saved?.rejected) ? saved.rejected.filter(isOwned) : [],
    });
  },
}));

/** Pending events the given session is allowed to replay. */
export function ownedPending(owner: QueueOwner): QueuedEvent[] {
  return ownedBy(useOfflineQueue.getState().events, owner);
}

function isOwned(entry: unknown): entry is QueuedEvent {
  if (typeof entry !== 'object' || entry === null) return false;
  const candidate = entry as Partial<QueuedEvent>;
  return (
    typeof candidate.userId === 'string' &&
    typeof candidate.householdId === 'string' &&
    typeof candidate.event === 'object' &&
    candidate.event !== null
  );
}

function persist(events: QueuedEvent[], rejected: RejectedEvent[]): void {
  const shape: PersistShape = { events, rejected };
  void writeJson(PERSIST_KEY, shape);
}
