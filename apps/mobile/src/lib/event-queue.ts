import type {
  InventoryEventInput,
  InventoryEventReason,
  SyncEventsResponse,
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

/**
 * Drop every event the server acknowledged. `applied` are events it just
 * committed; `skipped` are events it had already seen (a previous partial sync).
 * Both are resolved and must leave the queue.
 */
export function resolveSynced(
  queue: readonly InventoryEventInput[],
  response: Pick<SyncEventsResponse, 'applied' | 'skipped'>,
): InventoryEventInput[] {
  const resolved = new Set<string>([...response.applied, ...response.skipped]);
  return queue.filter((e) => !resolved.has(e.clientEventId));
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
