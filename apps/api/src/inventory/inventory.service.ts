import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import type {
  BulkCreateInventoryRequest,
  InventoryEvent,
  InventoryEventInput,
  InventoryItem,
  InventoryItemInput,
  ListInventoryQuery,
  SyncEventRejection,
  SyncEventsResponse,
  UpdateInventoryItemRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { ingredients, inventoryEvents, inventoryItems, storageLocations } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { numeric, toNumber } from '../common/serialization.js';
import { decodeCursor, toPage, type Page } from '../common/pagination.js';
import { ingredientNameMatches } from '../catalog/normalize.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { areCompatible, convertQuantity } from './units.js';
import {
  toInventoryEvent,
  toInventoryItem,
  type InventoryEventRow,
  type InventoryItemRow,
} from './inventory.serializer.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

interface AddStockInput {
  householdId: string;
  ingredientId: string;
  locationId: string;
  quantity: number;
  unit: InventoryItem['unit'];
  brand: string | null;
  expiresAt: string | null;
  source: InventoryItem['source'];
  confidence: number | null;
  photoKey: string | null;
  actorUserId: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

function earlierDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/**
 * A slot pools stock, so it can only claim a brand while every addition agrees.
 * Adding Al Marai milk to unbranded milk does not make the older stock Al
 * Marai, and overwriting with the newest brand would mislabel what is already
 * there — so any disagreement, in either direction, resolves to null ("mixed").
 */
function mergeBrand(existing: string | null, incoming: string | null): string | null {
  return existing === incoming ? existing : null;
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  /* --------------------------- reads --------------------------- */

  async list(householdId: string, query: ListInventoryQuery): Promise<Page<InventoryItem>> {
    const offset = decodeCursor(query.cursor);
    const conditions: SQL[] = [eq(inventoryItems.householdId, householdId)];
    if (query.locationId) conditions.push(eq(inventoryItems.locationId, query.locationId));
    if (query.category) conditions.push(eq(ingredients.category, query.category));
    if (query.q) conditions.push(ingredientNameMatches(query.q));
    if (query.expiringWithinDays !== undefined) {
      conditions.push(isNotNull(inventoryItems.expiresAt));
      conditions.push(
        sql`${inventoryItems.expiresAt} <= (current_date + ${query.expiringWithinDays}::int)`,
      );
    }

    const orderBy =
      query.sort === 'name'
        ? [asc(ingredients.canonicalNameEn)]
        : query.sort === 'recent'
          ? [desc(inventoryItems.createdAt)]
          : [sql`${inventoryItems.expiresAt} asc nulls last`, asc(ingredients.canonicalNameEn)];

    const rows = await this.db
      .select({ item: inventoryItems, ingredient: ingredients })
      .from(inventoryItems)
      .innerJoin(ingredients, eq(ingredients.id, inventoryItems.ingredientId))
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(query.limit + 1)
      .offset(offset);

    const page = toPage(rows, offset, query.limit);
    return {
      items: page.items.map((row) =>
        toInventoryItem(row.item as InventoryItemRow, row.ingredient),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async listEvents(householdId: string): Promise<InventoryEvent[]> {
    const rows = await this.db
      .select()
      .from(inventoryEvents)
      .where(eq(inventoryEvents.householdId, householdId))
      .orderBy(desc(inventoryEvents.createdAt))
      .limit(500);
    return rows.map((row) => toInventoryEvent(row as InventoryEventRow));
  }

  /* --------------------------- writes -------------------------- */

  async bulkCreate(
    householdId: string,
    userId: string,
    dto: BulkCreateInventoryRequest,
  ): Promise<InventoryItem[]> {
    const resolved = await Promise.all(
      dto.items.map((input) => this.resolveIngredientId(input)),
    );

    const itemIds = await this.db.transaction(async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < dto.items.length; i += 1) {
        const input = dto.items[i]!;
        const ingredientId = resolved[i]!;
        await this.assertLocation(tx, householdId, input.locationId);
        const id = await this.addStock(tx, {
          householdId,
          ingredientId,
          locationId: input.locationId,
          quantity: input.quantity,
          unit: input.unit,
          brand: input.brand,
          expiresAt: input.expiresAt,
          source: input.source,
          confidence: input.confidence,
          photoKey: input.photoKey,
          actorUserId: userId,
        });
        ids.push(id);
      }
      return ids;
    });

    return this.fetchItems(householdId, itemIds);
  }

  async get(householdId: string, id: string): Promise<InventoryItem> {
    const [item] = await this.fetchItems(householdId, [id]);
    if (!item) throw AppError.notFound();
    return item;
  }

  async update(
    householdId: string,
    userId: string,
    id: string,
    dto: UpdateInventoryItemRequest,
  ): Promise<InventoryItem> {
    await this.db.transaction(async (tx) => {
      // Read inside the transaction, with the row locked. The `corrected` event
      // below records `finalQuantity - current`, so a concurrent sync landing
      // between the read and the write would make that delta describe a
      // quantity the item never held — and the ledger would stop summing to the
      // stored quantity.
      const current = await this.requireItem(tx, householdId, id);

      const finalUnit = dto.unit ?? current.unit;
      const currentQty = toNumber(current.quantity);

      if (dto.unit && dto.unit !== current.unit && dto.quantity === undefined) {
        if (!areCompatible(current.unit, dto.unit)) throw AppError.validation({ reason: 'incompatible_unit' });
      }

      let finalQuantity = currentQty;
      if (dto.quantity !== undefined) {
        finalQuantity = dto.quantity;
      } else if (dto.unit && dto.unit !== current.unit) {
        finalQuantity = convertQuantity(currentQty, current.unit, finalUnit) ?? currentQty;
      }

      const priorInFinalUnit = convertQuantity(currentQty, current.unit, finalUnit) ?? 0;
      const delta = finalQuantity - priorInFinalUnit;

      if (dto.locationId) await this.assertLocation(tx, householdId, dto.locationId);

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (dto.locationId !== undefined) patch.locationId = dto.locationId;
      if (dto.unit !== undefined) patch.unit = finalUnit;
      if (dto.expiresAt !== undefined) patch.expiresAt = dto.expiresAt;
      if (dto.brand !== undefined) patch.brand = dto.brand;
      if (dto.quantity !== undefined || (dto.unit && dto.unit !== current.unit)) {
        patch.quantity = numeric(finalQuantity);
      }

      try {
        await tx.update(inventoryItems).set(patch).where(eq(inventoryItems.id, id));
      } catch (error) {
        if (isUniqueViolation(error)) throw AppError.conflict();
        throw error;
      }

      if (delta !== 0) {
        await tx.insert(inventoryEvents).values({
          itemId: id,
          householdId,
          delta: numeric(delta),
          unit: finalUnit,
          reason: 'corrected',
          actorUserId: userId,
        });
      }
    });

    const [item] = await this.fetchItems(householdId, [id]);
    if (!item) throw AppError.notFound();
    return item;
  }

  async delete(householdId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
      .returning({ id: inventoryItems.id });
    if (!row) throw AppError.notFound();
  }

  /**
   * Offline replay. Idempotent by `clientEventId` (unique index). The batch
   * splits three ways so the client never loses an edit:
   *   - `applied`   — newly committed events.
   *   - `duplicate` — a `clientEventId` we already committed; safe for the
   *     client to drop (it was applied on an earlier sync).
   *   - `rejected`  — events that could NOT be applied ({@link SyncEventRejection}
   *     with a reason); the client must surface/retry these rather than drop
   *     them, otherwise the user's change is silently discarded.
   * Deltas sum, so two members editing the same item concurrently converge.
   * See spec §9.
   */
  async sync(
    householdId: string,
    userId: string,
    events: InventoryEventInput[],
  ): Promise<SyncEventsResponse> {
    const applied: string[] = [];
    const duplicate: string[] = [];
    const rejected: SyncEventRejection[] = [];
    const touched = new Set<string>();

    // `occurredAt` is an ISO date-time and `isoDateTimeSchema` accepts UTC
    // offsets, so `2026-01-01T10:00:00+03:00` sorts *after*
    // `2026-01-01T09:00:00Z` lexically while being an hour earlier in real
    // time. Deltas are applied in this order, so getting it wrong reorders a
    // user's edits. Compare instants.
    const ordered = [...events].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

    await this.db.transaction(async (tx) => {
      // Lock the whole batch up front in primary-key order. Each event's UPDATE
      // takes a row lock that is then held for the rest of the transaction, and
      // the order events arrive in is chosen by the client — so two batches
      // touching the same two items in opposite orders would deadlock, as would
      // a batch racing `markCooked`, which locks the same table. Both paths now
      // acquire in the same canonical order, so there is no cycle to close.
      const itemIds = [...new Set(ordered.map((event) => event.itemId))];
      if (itemIds.length > 0) {
        await tx
          .select({ id: inventoryItems.id })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.householdId, householdId),
              inArray(inventoryItems.id, itemIds),
            ),
          )
          .orderBy(inventoryItems.id)
          .for('update');
      }

      for (const event of ordered) {
        const [item] = await tx
          .select({ id: inventoryItems.id, unit: inventoryItems.unit })
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.id, event.itemId),
              eq(inventoryItems.householdId, householdId),
            ),
          )
          .limit(1);
        if (!item) {
          // A cross-household item id also lands here and is reported as
          // `item_not_found` on purpose: a distinct "wrong household" reason
          // would let a caller probe which item ids exist in other households.
          rejected.push({ clientEventId: event.clientEventId, reason: 'item_not_found' });
          continue;
        }

        const deltaInItemUnit = convertQuantity(event.delta, event.unit, item.unit);
        if (deltaInItemUnit === null) {
          rejected.push({ clientEventId: event.clientEventId, reason: 'incompatible_unit' });
          continue;
        }

        touched.add(event.itemId);

        const inserted = await tx
          .insert(inventoryEvents)
          .values({
            clientEventId: event.clientEventId,
            itemId: event.itemId,
            householdId,
            delta: numeric(event.delta),
            unit: event.unit,
            reason: event.reason,
            mealPlanEntryId: event.mealPlanEntryId,
            actorUserId: userId,
            occurredAt: new Date(event.occurredAt),
          })
          .onConflictDoNothing({ target: inventoryEvents.clientEventId })
          .returning({ id: inventoryEvents.id });

        if (inserted.length === 0) {
          // Already committed on an earlier sync — resolved, not a failure.
          duplicate.push(event.clientEventId);
          continue;
        }

        await tx
          .update(inventoryItems)
          .set({
            quantity: sql`greatest(${inventoryItems.quantity} + ${numeric(deltaInItemUnit)}::numeric, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, event.itemId));

        applied.push(event.clientEventId);
      }
    });

    return { applied, duplicate, rejected, items: await this.fetchItems(householdId, [...touched]) };
  }

  /* --------------------------- helpers ------------------------- */

  private async resolveIngredientId(input: InventoryItemInput): Promise<string> {
    if (input.ingredientId) return input.ingredientId;
    if (!input.rawName) throw AppError.validation({ reason: 'missing_ingredient' });
    return this.catalog.resolveOrCreate(input.rawName, input.rawNameAr);
  }

  private async addStock(tx: Tx, input: AddStockInput): Promise<string> {
    const existing = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.householdId, input.householdId),
          eq(inventoryItems.ingredientId, input.ingredientId),
          eq(inventoryItems.locationId, input.locationId),
        ),
      );

    const match = existing.find((row) => areCompatible(row.unit, input.unit));
    if (existing.length > 0 && !match) {
      throw AppError.validation({ reason: 'incompatible_unit' });
    }

    if (match) {
      const deltaInItemUnit = convertQuantity(input.quantity, input.unit, match.unit)!;
      await tx
        .update(inventoryItems)
        .set({
          quantity: sql`greatest(${inventoryItems.quantity} + ${numeric(deltaInItemUnit)}::numeric, 0)`,
          brand: mergeBrand(match.brand, input.brand),
          expiresAt: earlierDate(match.expiresAt, input.expiresAt),
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, match.id));
      await tx.insert(inventoryEvents).values({
        itemId: match.id,
        householdId: input.householdId,
        delta: numeric(deltaInItemUnit),
        unit: match.unit,
        reason: 'added',
        actorUserId: input.actorUserId,
      });
      return match.id;
    }

    const [item] = await tx
      .insert(inventoryItems)
      .values({
        householdId: input.householdId,
        ingredientId: input.ingredientId,
        locationId: input.locationId,
        quantity: numeric(input.quantity),
        unit: input.unit,
        brand: input.brand,
        expiresAt: input.expiresAt,
        source: input.source,
        confidence: input.confidence === null ? null : numeric(input.confidence),
        photoKey: input.photoKey,
      })
      .returning({ id: inventoryItems.id });
    if (!item) throw new AppError('INTERNAL_ERROR');

    await tx.insert(inventoryEvents).values({
      itemId: item.id,
      householdId: input.householdId,
      delta: numeric(input.quantity),
      unit: input.unit,
      reason: 'added',
      actorUserId: input.actorUserId,
    });
    return item.id;
  }

  private async assertLocation(tx: Tx, householdId: string, locationId: string): Promise<void> {
    const [row] = await tx
      .select({ id: storageLocations.id })
      .from(storageLocations)
      .where(
        and(eq(storageLocations.id, locationId), eq(storageLocations.householdId, householdId)),
      )
      .limit(1);
    if (!row) throw AppError.notFound();
  }

  /** Locks the row so a read-modify-write can be trusted; caller supplies the tx. */
  private async requireItem(tx: Tx, householdId: string, id: string): Promise<InventoryItemRow> {
    const [row] = await tx
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
      .limit(1)
      .for('update');
    if (!row) throw AppError.notFound();
    return row as InventoryItemRow;
  }

  private async fetchItems(householdId: string, itemIds: string[]): Promise<InventoryItem[]> {
    if (itemIds.length === 0) return [];
    const rows = await this.db
      .select({ item: inventoryItems, ingredient: ingredients })
      .from(inventoryItems)
      .innerJoin(ingredients, eq(ingredients.id, inventoryItems.ingredientId))
      .where(
        and(eq(inventoryItems.householdId, householdId), inArray(inventoryItems.id, itemIds)),
      );
    return rows.map((row) => toInventoryItem(row.item as InventoryItemRow, row.ingredient));
  }
}
