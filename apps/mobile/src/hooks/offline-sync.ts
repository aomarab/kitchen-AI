import { useEffect } from 'react';
import { NetworkError } from '@kitchen/api-client';
import { api } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { batchEvents } from '../lib/event-queue';
import { uuidv4 } from '../lib/uuid';
import { useOfflineQueue } from '../stores/offline-queue';
import { useConnectivity } from '../stores/connectivity';
import { qk } from './keys';

let flushing = false;

/**
 * Replays every queued inventory event through `syncInventoryEvents`. Safe to
 * call anytime: a `NetworkError` leaves the queue intact (we are simply still
 * offline), and because each event carries a `clientEventId` the server ignores
 * anything it has already applied — so a double flush never double-counts.
 */
export async function flushInventoryQueue(): Promise<void> {
  if (flushing) return;
  const pending = useOfflineQueue.getState().events;
  if (pending.length === 0) return;

  flushing = true;
  try {
    for (const batch of batchEvents(pending)) {
      const response = await api.call('syncInventoryEvents', {
        body: { events: batch },
        idempotencyKey: uuidv4(),
      });
      useOfflineQueue.getState().resolve(response);
    }
    void queryClient.invalidateQueries({ queryKey: qk.inventory });
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error;
  } finally {
    flushing = false;
  }
}

/**
 * Watches connectivity and drains the offline queue whenever the device is
 * online and there is pending work. Mount once, high in the tree.
 */
export function useOfflineSync(): void {
  const online = useConnectivity((state) => state.online);
  const pending = useOfflineQueue((state) => state.events.length);
  useEffect(() => {
    if (online && pending > 0) void flushInventoryQueue();
  }, [online, pending]);
}
