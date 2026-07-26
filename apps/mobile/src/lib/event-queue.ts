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

/** Append an event, ignoring a `clientEventId` already queued (idempotent enqueue). */
export function enqueue(
  queue: readonly InventoryEventInput[],
  event: InventoryEventInput,
): InventoryEventInput[] {
  if (queue.some((e) => e.clientEventId === event.clientEventId)) {
    return [...queue];
  }
  return [...queue, event];
}

/** An event the server refused to apply, kept so the user can be told. */
export interface RejectedEvent {
  event: InventoryEventInput;
  reason: SyncRejectionReason;
}

/** Outcome of reconciling the local queue against a sync response. */
export interface SyncResolution {
  /** Events still awaiting sync — neither committed nor rejected. */
  pending: InventoryEventInput[];
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
  queue: readonly InventoryEventInput[],
  response: Pick<SyncEventsResponse, 'applied' | 'duplicate' | 'rejected'>,
): SyncResolution {
  const committed = new Set<string>([...response.applied, ...response.duplicate]);
  const rejectionReason = new Map(response.rejected.map((r) => [r.clientEventId, r.reason]));
  const pending: InventoryEventInput[] = [];
  const rejected: RejectedEvent[] = [];
  for (const event of queue) {
    if (committed.has(event.clientEventId)) continue;
    const reason = rejectionReason.get(event.clientEventId);
    if (reason) {
      rejected.push({ event, reason });
      continue;
    }
    pending.push(event);
  }
  return { pending, rejected };
}

export function pendingCount(queue: readonly InventoryEventInput[]): number {
  return queue.length;
}

/** Split into batches respecting the contract's per-request cap (500). */
export function batchEvents(
  queue: readonly InventoryEventInput[],
  size = 500,
): InventoryEventInput[][] {
  if (queue.length === 0) return [];
  const batches: InventoryEventInput[][] = [];
  for (let i = 0; i < queue.length; i += size) {
    batches.push(queue.slice(i, i + size));
  }
  return batches;
}
