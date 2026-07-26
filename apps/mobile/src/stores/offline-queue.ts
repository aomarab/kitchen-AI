import { create } from 'zustand';
import type { InventoryEventInput, SyncEventsResponse } from '@kitchen/contracts';
import {
  enqueue,
  makeInventoryEvent,
  resolveSynced,
  type MakeEventParams,
} from '../lib/event-queue';
import { readJson, writeJson } from '../lib/storage';

const PERSIST_KEY = 'offline_events';

interface OfflineQueueState {
  events: InventoryEventInput[];
  /** Build an inventory event and append it to the durable queue. */
  enqueue: (params: MakeEventParams) => InventoryEventInput;
  /** Remove events the server acknowledged (applied + already-seen). */
  resolve: (response: Pick<SyncEventsResponse, 'applied' | 'skipped'>) => void;
  hydrate: () => Promise<void>;
}

/**
 * Durable offline write queue. Every inventory mutation is recorded as an event
 * with a client id so replay through `syncInventoryEvents` is idempotent
 * (spec §9). The queue survives app restarts via the JSON store.
 */
export const useOfflineQueue = create<OfflineQueueState>((set, get) => ({
  events: [],

  enqueue: (params) => {
    const event = makeInventoryEvent(params);
    const events = enqueue(get().events, event);
    set({ events });
    void writeJson(PERSIST_KEY, events);
    return event;
  },

  resolve: (response) => {
    const events = resolveSynced(get().events, response);
    set({ events });
    void writeJson(PERSIST_KEY, events);
  },

  hydrate: async () => {
    const saved = await readJson<InventoryEventInput[]>(PERSIST_KEY);
    if (saved && Array.isArray(saved)) set({ events: saved });
  },
}));
