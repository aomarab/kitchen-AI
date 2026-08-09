import { useEffect } from 'react';
import { NetworkError } from '@kitchen/api-client';
import { api } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { batchEvents, type QueueOwner } from '../lib/event-queue';
import { uuidv4 } from '../lib/uuid';
import { useOfflineQueue, ownedPending } from '../stores/offline-queue';
import { useAuthStore } from '../stores/auth';
import { useConnectivity } from '../stores/connectivity';
import { qk } from './keys';

let flushing = false;

/**
 * Replays the queued inventory events *belonging to the current session*
 * through `syncInventoryEvents`.
 *
 * Safe to call anytime: a `NetworkError` leaves the queue intact (we are simply
 * still offline), and because each event carries a `clientEventId` the server
 * ignores anything it has already applied — so a double flush never
 * double-counts.
 *
 * The owner filter is what keeps a shared device honest. The queue is durable
 * and survives sign-out, and the server takes the actor and household from the
 * caller's credentials, so replaying an unowned event would silently write one
 * person's changes into whoever is signed in now.
 */
export async function flushInventoryQueue(): Promise<void> {
  if (flushing) return;
  const owner = currentOwner();
  if (!owner) return;
  const pending = ownedPending(owner);
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

/** The signed-in user and their active household, or `null` if either is missing. */
export function currentOwner(): QueueOwner | null {
  const { user, activeHouseholdId } = useAuthStore.getState();
  if (!user || !activeHouseholdId) return null;
  return { userId: user.id, householdId: activeHouseholdId };
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
