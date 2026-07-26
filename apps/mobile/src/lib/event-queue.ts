import type {
  InventoryEventInput,
  InventoryEventReason,
  SyncEventsResponse,
  SyncRejectionReason,
  Unit,
} from '@kitchen/contracts';
import { uuidv4 } from './uuid';

/**
 * Offline inventory write queue — pure, so it is fully unit-testable.
 *
 * The spec models inventory as an append-only event ledger (spec §4.2, §9).
 * Every mutation becomes an {@link InventoryEventInput} carrying a
 * client-generated `clientEventId`. When the device reconnects the queue is
 * replayed through `syncInventoryEvents`; because the server keys on
 * `clientEventId`, replaying the same event twice is a no-op. That makes a
 * double-tap, a crash mid-sync, or two members editing the same item safe by
 * construction.
 */

export interface MakeEventParams {
  itemId: string;
  delta: number;
  unit: Unit;
  reason: InventoryEventReason;
  mealPlanEntryId?: string | null;
  occurredAt?: string;
}

export function makeInventoryEvent(params: MakeEventParams): InventoryEventInput {
  return {
    clientEventId: uuidv4(),
    itemId: params.itemId,
    delta: params.delta,
    unit: params.unit,
    reason: params.reason,
    mealPlanEntryId: params.mealPlanEntryId ?? null,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
  };
}

/** Whose queue an event belongs to. */
export interface QueueOwner {
  userId: string;
  householdId: string;
}

/**
 * A queued event plus the identity that created it.
 *
 * The queue is durable and the device is shared: it survives sign-out, so
 * without an owner the next person to sign in would replay someone else's
 * pending writes. `itemId` alone is not enough — two members of the same
 * household would still have each other's edits attributed to whoever happens
 * to be signed in when connectivity returns, because the server takes the actor
 * from the bearer token.
 */
export interface QueuedEvent extends QueueOwner {
  event: InventoryEventInput;
}

export function isOwnedBy(entry: QueueOwner, owner: QueueOwner): boolean {
  return entry.userId === owner.userId && entry.householdId === owner.householdId;
}

/** The subset of the queue the given session is allowed to replay. */
export function ownedBy<T extends QueueOwner>(queue: readonly T[], owner: QueueOwner): T[] {
  return queue.filter((entry) => isOwnedBy(entry, owner));
}

/** Append an event, ignoring a `clientEventId` already queued (idempotent enqueue). */
export function enqueue(
  queue: readonly QueuedEvent[],
  entry: QueuedEvent,
): QueuedEvent[] {
  if (queue.some((e) => e.event.clientEventId === entry.event.clientEventId)) {
    return [...queue];
  }
  return [...queue, entry];
}

/** An event the server refused to apply, kept so the user can be told. */
export interface RejectedEvent extends QueuedEvent {
  reason: SyncRejectionReason;
}

/** Outcome of reconciling the local queue against a sync response. */
export interface SyncResolution {
  /** Events still awaiting sync — neither committed nor rejected. */
  pending: QueuedEvent[];
  /**
   * Events the server will never accept (item deleted, incompatible unit,
   * malformed). Retrying is futile, so they are pulled out of the pending queue,
   * but returned here so the caller can surface them — never silently dropped.
   */
  rejected: RejectedEvent[];
}

/**
 * Reconcile the queue against a sync response. `applied` (just committed) and
 * `duplicate` (already committed on a prior sync) are both resolved and leave
 * the queue. `rejected` events were NOT applied: retrying can never succeed, so
 * they are removed from the pending queue to avoid an infinite loop, but they
 * are surfaced separately so the user's edit is never lost in silence
 * (spec §9; contract `syncEventsResponseSchema`).
 */
export function resolveSynced(
  queue: readonly QueuedEvent[],
  response: Pick<SyncEventsResponse, 'applied' | 'duplicate' | 'rejected'>,
): SyncResolution {
  const committed = new Set<string>([...response.applied, ...response.duplicate]);
  const rejectionReason = new Map(response.rejected.map((r) => [r.clientEventId, r.reason]));
  const pending: QueuedEvent[] = [];
  const rejected: RejectedEvent[] = [];
  for (const entry of queue) {
    if (committed.has(entry.event.clientEventId)) continue;
    const reason = rejectionReason.get(entry.event.clientEventId);
    if (reason) {
      rejected.push({ ...entry, reason });
      continue;
    }
    pending.push(entry);
  }
  return { pending, rejected };
}

export function pendingCount(queue: readonly QueuedEvent[]): number {
  return queue.length;
}

/** Split into batches respecting the contract's per-request cap (500). */
export function batchEvents(
  queue: readonly QueuedEvent[],
  size = 500,
): InventoryEventInput[][] {
  if (queue.length === 0) return [];
  const batches: InventoryEventInput[][] = [];
  for (let i = 0; i < queue.length; i += size) {
    batches.push(queue.slice(i, i + size).map((entry) => entry.event));
  }
  return batches;
}
