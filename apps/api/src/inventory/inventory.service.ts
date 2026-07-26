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

  async update(
    householdId: string,
    userId: string,
    id: string,
    dto: UpdateInventoryItemRequest,
  ): Promise<InventoryItem> {
    const current = await this.requireItem(householdId, id);

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

    await this.db.transaction(async (tx) => {
      if (dto.locationId) await this.assertLocation(tx, householdId, dto.locationId);

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (dto.locationId !== undefined) patch.locationId = dto.locationId;
      if (dto.unit !== undefined) patch.unit = finalUnit;
      if (dto.expiresAt !== undefined) patch.expiresAt = dto.expiresAt;
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

    const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    await this.db.transaction(async (tx) => {
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
    return this.catalog.resolveOrCreate(input.rawName);
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

  private async requireItem(householdId: string, id: string): Promise<InventoryItemRow> {
    const [row] = await this.db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
      .limit(1);
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
