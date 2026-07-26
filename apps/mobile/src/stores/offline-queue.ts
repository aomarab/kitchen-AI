import { create } from 'zustand';
import type { InventoryEventInput, SyncEventsResponse } from '@kitchen/contracts';
import {
  enqueue,
  makeInventoryEvent,
  resolveSynced,
  type MakeEventParams,
  type RejectedEvent,
} from '../lib/event-queue';
import { readJson, writeJson } from '../lib/storage';

const PERSIST_KEY = 'offline_events';

interface PersistShape {
  events: InventoryEventInput[];
  rejected: RejectedEvent[];
}

interface OfflineQueueState {
  events: InventoryEventInput[];
  /** Events the server refused; surfaced to the user, never silently dropped. */
  rejected: RejectedEvent[];
  /** Build an inventory event and append it to the durable queue. */
  enqueue: (params: MakeEventParams) => InventoryEventInput;
  /**
   * Reconcile the queue against a sync response: drop committed events, keep the
   * rest pending, and move rejected events into the visible `rejected` list.
   */
  resolve: (response: Pick<SyncEventsResponse, 'applied' | 'duplicate' | 'rejected'>) => void;
  /** Acknowledge and clear a surfaced sync failure. */
  dismissRejected: (clientEventId: string) => void;
  hydrate: () => Promise<void>;
}

/**
 * Durable offline write queue. Every inventory mutation is recorded as an event
 * with a client id so replay through `syncInventoryEvents` is idempotent
 * (spec §9). The queue survives app restarts via the JSON store.
 */
export const useOfflineQueue = create<OfflineQueueState>((set, get) => ({
  events: [],
  rejected: [],

  enqueue: (params) => {
    const event = makeInventoryEvent(params);
    const events = enqueue(get().events, event);
    set({ events });
    persist(events, get().rejected);
    return event;
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

  hydrate: async () => {
    const saved = await readJson<PersistShape | InventoryEventInput[]>(PERSIST_KEY);
    if (Array.isArray(saved)) {
      set({ events: saved, rejected: [] });
    } else if (saved && Array.isArray(saved.events)) {
      set({ events: saved.events, rejected: Array.isArray(saved.rejected) ? saved.rejected : [] });
    }
  },
}));

function persist(events: InventoryEventInput[], rejected: RejectedEvent[]): void {
  const shape: PersistShape = { events, rejected };
  void writeJson(PERSIST_KEY, shape);
}
