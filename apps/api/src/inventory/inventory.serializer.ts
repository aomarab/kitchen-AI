import type {
  InventoryEvent,
  InventoryEventReason,
  InventoryItem,
  StorageLocation,
  StorageLocationType,
  Unit,
} from '@kitchen/contracts';
import { toIso, toNullableNumber, toNumber } from '../common/serialization.js';
import { toIngredient, type IngredientRow } from '../catalog/catalog.serializer.js';

export interface StorageLocationRow {
  id: string;
  householdId: string;
  name: string;
  type: StorageLocationType;
}

export function toStorageLocation(row: StorageLocationRow): StorageLocation {
  return { id: row.id, householdId: row.householdId, name: row.name, type: row.type };
}

export interface InventoryItemRow {
  id: string;
  householdId: string;
  locationId: string;
  quantity: string;
  unit: Unit;
  brand: string | null;
  label: string | null;
  expiresAt: string | null;
  source: InventoryItem['source'];
  confidence: string | null;
  photoKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toInventoryItem(item: InventoryItemRow, ingredient: IngredientRow): InventoryItem {
  return {
    id: item.id,
    householdId: item.householdId,
    ingredient: toIngredient(ingredient),
    brand: item.brand,
    label: item.label,
    locationId: item.locationId,
    quantity: toNumber(item.quantity),
    unit: item.unit,
    expiresAt: item.expiresAt,
    source: item.source,
    confidence: toNullableNumber(item.confidence),
    photoKey: item.photoKey,
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt),
  };
}

export interface InventoryEventRow {
  id: string;
  itemId: string;
  householdId: string;
  delta: string;
  unit: Unit;
  reason: InventoryEventReason;
  mealPlanEntryId: string | null;
  actorUserId: string | null;
  createdAt: Date;
}

export function toInventoryEvent(row: InventoryEventRow): InventoryEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    householdId: row.householdId,
    delta: toNumber(row.delta),
    unit: row.unit,
    reason: row.reason,
    mealPlanEntryId: row.mealPlanEntryId,
    actorUserId: row.actorUserId,
    createdAt: toIso(row.createdAt),
  };
}
