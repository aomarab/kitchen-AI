import { z } from 'zod';
import { ingredientSchema } from './catalog.js';
import {
  ingredientCategorySchema,
  inventorySourceSchema,
  isoDateSchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  quantitySchema,
  storageLocationTypeSchema,
  unitSchema,
  uuidSchema,
} from './common.js';

/* ------------------------------------------------------------------ */
/* Storage locations                                                   */
/* ------------------------------------------------------------------ */

export const storageLocationSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  name: z.string().min(1).max(60),
  type: storageLocationTypeSchema,
});
export type StorageLocation = z.infer<typeof storageLocationSchema>;

export const createStorageLocationRequestSchema = storageLocationSchema.omit({
  id: true,
  householdId: true,
});
export type CreateStorageLocationRequest = z.infer<typeof createStorageLocationRequestSchema>;

/* ------------------------------------------------------------------ */
/* Inventory items                                                     */
/* ------------------------------------------------------------------ */

export const inventoryItemSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  ingredient: ingredientSchema,
  locationId: uuidSchema,
  quantity: quantitySchema,
  unit: unitSchema,
  expiresAt: isoDateSchema.nullable(),
  source: inventorySourceSchema,
  confidence: z.number().min(0).max(1).nullable(),
  photoKey: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const listInventoryQuerySchema = paginationQuerySchema.extend({
  locationId: uuidSchema.optional(),
  category: ingredientCategorySchema.optional(),
  q: z.string().max(80).optional(),
  /** Only items expiring within this many days. */
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  sort: z.enum(['expiry', 'name', 'recent']).default('expiry'),
});
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;

/** One item as submitted by the user after reviewing a capture. */
export const inventoryItemInputSchema = z.object({
  ingredientId: uuidSchema.nullable(),
  /** Used when `ingredientId` is null — the API creates/resolves a catalog row. */
  rawName: z.string().min(1).max(120).optional(),
  locationId: uuidSchema,
  quantity: quantitySchema,
  unit: unitSchema,
  expiresAt: isoDateSchema.nullable().default(null),
  source: inventorySourceSchema,
  confidence: z.number().min(0).max(1).nullable().default(null),
  photoKey: z.string().nullable().default(null),
});
export type InventoryItemInput = z.infer<typeof inventoryItemInputSchema>;

export const bulkCreateInventoryRequestSchema = z.object({
  items: z.array(inventoryItemInputSchema).min(1).max(200),
});
export type BulkCreateInventoryRequest = z.infer<typeof bulkCreateInventoryRequestSchema>;

export const updateInventoryItemRequestSchema = z
  .object({
    locationId: uuidSchema,
    quantity: quantitySchema,
    unit: unitSchema,
    expiresAt: isoDateSchema.nullable(),
  })
  .partial();
export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemRequestSchema>;

/* ------------------------------------------------------------------ */
/* Event ledger — append-only, enables offline replay & undo (spec §9)  */
/* ------------------------------------------------------------------ */

export const inventoryEventReasonSchema = z.enum([
  'added',
  'consumed',
  'expired',
  'corrected',
  'purchased',
]);
export type InventoryEventReason = z.infer<typeof inventoryEventReasonSchema>;

export const inventoryEventSchema = z.object({
  id: uuidSchema,
  itemId: uuidSchema,
  householdId: uuidSchema,
  delta: z.number().finite(),
  unit: unitSchema,
  reason: inventoryEventReasonSchema,
  mealPlanEntryId: uuidSchema.nullable(),
  actorUserId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type InventoryEvent = z.infer<typeof inventoryEventSchema>;

/**
 * Offline write queue payload. Clients assign `clientEventId` so replays are
 * idempotent — the server ignores an id it has already applied.
 */
export const inventoryEventInputSchema = z.object({
  clientEventId: uuidSchema,
  itemId: uuidSchema,
  delta: z.number().finite(),
  unit: unitSchema,
  reason: inventoryEventReasonSchema,
  mealPlanEntryId: uuidSchema.nullable().default(null),
  occurredAt: isoDateTimeSchema,
});
export type InventoryEventInput = z.infer<typeof inventoryEventInputSchema>;

export const syncEventsRequestSchema = z.object({
  events: z.array(inventoryEventInputSchema).min(1).max(500),
});
export type SyncEventsRequest = z.infer<typeof syncEventsRequestSchema>;

/** Why the server could not apply a synced event. */
export const syncRejectionReasonSchema = z.enum([
  'item_not_found',
  'incompatible_unit',
  'invalid_event',
]);
export type SyncRejectionReason = z.infer<typeof syncRejectionReasonSchema>;

export const syncEventRejectionSchema = z.object({
  clientEventId: uuidSchema,
  reason: syncRejectionReasonSchema,
});
export type SyncEventRejection = z.infer<typeof syncEventRejectionSchema>;

/**
 * A replayed batch splits three ways, and the difference matters. `applied` and
 * `duplicate` are both resolved — the server holds the user's change either way,
 * so the client drops them from its queue. `rejected` events were NOT applied;
 * collapsing them into a single "skipped" list would make a client that clears
 * its queue on acknowledgement silently discard the user's edit.
 */
export const syncEventsResponseSchema = z.object({
  applied: z.array(uuidSchema),
  duplicate: z.array(uuidSchema),
  rejected: z.array(syncEventRejectionSchema),
  items: z.array(inventoryItemSchema),
});
export type SyncEventsResponse = z.infer<typeof syncEventsResponseSchema>;

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

export const presignUploadRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  /** Bytes. Rejected above 15 MB. */
  contentLength: z.number().int().positive().max(15 * 1024 * 1024),
  purpose: z.enum(['inventory_photo', 'receipt', 'recipe_image', 'avatar']),
});
export type PresignUploadRequest = z.infer<typeof presignUploadRequestSchema>;

export const presignUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  /** Opaque key the client sends back to the API once the upload completes. */
  key: z.string(),
  /** Extra form/header fields the client must include with the PUT. */
  headers: z.record(z.string()).default({}),
  expiresIn: z.number().int().positive(),
});
export type PresignUploadResponse = z.infer<typeof presignUploadResponseSchema>;
