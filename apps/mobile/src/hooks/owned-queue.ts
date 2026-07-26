import { useMemo } from 'react';
import { ownedBy, type QueueOwner } from '../lib/event-queue';
import { useAuthStore } from '../stores/auth';

/**
 * Narrows a durable queue slice to the entries belonging to the current session.
 *
 * The offline queue survives sign-out and a device can be shared, so anything
 * user-facing that counts or lists queued work has to filter the same way the
 * flush does — otherwise one member sees another's pending writes attributed to
 * them.
 */
export function useOwnedQueue<T extends QueueOwner>(entries: readonly T[]): T[] {
  const user = useAuthStore((state) => state.user);
  const householdId = useAuthStore((state) => state.activeHouseholdId);
  return useMemo(() => {
    if (!user || !householdId) return [];
    return ownedBy(entries, { userId: user.id, householdId });
  }, [entries, user, householdId]);
}
