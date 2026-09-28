import type { InventoryEvent } from '@kitchen/contracts';

export function itemHistory(events: readonly InventoryEvent[], itemId: string): InventoryEvent[] {
  return events
    .filter((event) => event.itemId === itemId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
