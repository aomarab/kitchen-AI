import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type {
  CreateStorageLocationRequest,
  DeleteStorageLocationQuery,
  StorageLocation,
  UpdateStorageLocationRequest,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { inventoryEvents, inventoryItems, storageLocations } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { toStorageLocation } from './inventory.serializer.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type ItemRow = typeof inventoryItems.$inferSelect;

@Injectable()
export class LocationsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(householdId: string): Promise<StorageLocation[]> {
    const rows = await this.db
      .select()
      .from(storageLocations)
      .where(eq(storageLocations.householdId, householdId))
      .orderBy(storageLocations.name);
    return rows.map(toStorageLocation);
  }

  async create(householdId: string, dto: CreateStorageLocationRequest): Promise<StorageLocation> {
    const [row] = await this.db
      .insert(storageLocations)
      .values({ householdId, name: dto.name, type: dto.type })
      .returning();
    if (!row) throw new AppError('INTERNAL_ERROR');
    return toStorageLocation(row);
  }

  async update(
    householdId: string,
    id: string,
    dto: UpdateStorageLocationRequest,
  ): Promise<StorageLocation> {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.type !== undefined) patch.type = dto.type;

    // An empty patch is a read, not an error: `PATCH {}` should not 404 a row
    // that exists, and `.set({})` is invalid SQL.
    if (Object.keys(patch).length === 0) {
      const [row] = await this.db
        .select()
        .from(storageLocations)
        .where(and(eq(storageLocations.id, id), eq(storageLocations.householdId, householdId)));
      if (!row) throw AppError.notFound();
      return toStorageLocation(row);
    }

    const [row] = await this.db
      .update(storageLocations)
      .set(patch)
      .where(and(eq(storageLocations.id, id), eq(storageLocations.householdId, householdId)))
      .returning();
    if (!row) throw AppError.notFound();
    return toStorageLocation(row);
  }

  /**
   * Deletes a place, and refuses to take the food with it.
   *
   * The foreign key used to be `ON DELETE cascade`, so this silently destroyed
   * every item in the location — and their events, which cascade from the item.
   * Emptying a shelf is a decision about food and has to be made deliberately,
   * so a location that still holds something is either given somewhere to send
   * it or refused with the count, which is the number a caller needs in order
   * to say what is about to happen.
   */
  async delete(
    householdId: string,
    id: string,
    query: DeleteStorageLocationQuery = {},
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [location] = await tx
        .select({ id: storageLocations.id })
        .from(storageLocations)
        .where(and(eq(storageLocations.id, id), eq(storageLocations.householdId, householdId)));
      if (!location) throw AppError.notFound();

      const contents = await tx
        .select({
          id: inventoryItems.id,
          ingredientId: inventoryItems.ingredientId,
          unit: inventoryItems.unit,
          quantity: inventoryItems.quantity,
          expiresAt: inventoryItems.expiresAt,
        })
        .from(inventoryItems)
        .where(eq(inventoryItems.locationId, id));

      if (contents.length > 0) {
        const moveTo = query.moveTo;
        if (!moveTo) {
          throw AppError.conflict(undefined, {
            reason: 'location_not_empty',
            itemCount: contents.length,
          });
        }
        if (moveTo === id) throw AppError.validation({ reason: 'move_to_self' });

        const [destination] = await tx
          .select({ id: storageLocations.id })
          .from(storageLocations)
          .where(
            and(eq(storageLocations.id, moveTo), eq(storageLocations.householdId, householdId)),
          );
        if (!destination) throw AppError.notFound();

        for (const item of contents) {
          await this.moveItem(tx, item, moveTo);
        }
      }

      await tx.delete(storageLocations).where(eq(storageLocations.id, id));
    });
  }

  /**
   * Moves one item to another place, merging when that place already holds the
   * same ingredient in the same unit.
   *
   * Merging is not a nicety: `inventory_unique_slot` is unique on
   * (household, ingredient, location, unit), so plain re-pointing fails exactly
   * when someone is most likely to be reorganising — moving milk into a fridge
   * that already has milk.
   *
   * The merge re-points the source item's events onto the survivor instead of
   * letting them cascade away with the row. `quantity` is materialized from the
   * ledger, so keeping the quantity while dropping the events that produced it
   * leaves a row whose history no longer sums to it, and offline replay adds
   * its deltas to that broken sum.
   */
  private async moveItem(
    tx: Tx,
    item: Pick<ItemRow, 'id' | 'ingredientId' | 'unit' | 'quantity' | 'expiresAt'>,
    destinationId: string,
  ): Promise<void> {
    const [existing] = await tx
      .select({ id: inventoryItems.id, expiresAt: inventoryItems.expiresAt })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.locationId, destinationId),
          eq(inventoryItems.ingredientId, item.ingredientId),
          eq(inventoryItems.unit, item.unit),
        ),
      );

    if (!existing) {
      await tx
        .update(inventoryItems)
        .set({ locationId: destinationId, updatedAt: new Date() })
        .where(eq(inventoryItems.id, item.id));
      return;
    }

    await tx
      .update(inventoryEvents)
      .set({ itemId: existing.id })
      .where(eq(inventoryEvents.itemId, item.id));

    await tx
      .update(inventoryItems)
      .set({
        quantity: sql`${inventoryItems.quantity} + ${item.quantity}`,
        // Warning late is the dangerous direction, so the survivor inherits
        // whichever date comes first.
        expiresAt: earliest(existing.expiresAt, item.expiresAt),
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, existing.id));

    await tx.delete(inventoryItems).where(eq(inventoryItems.id, item.id));
  }
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  // ISO calendar dates sort correctly as strings, which is why they are stored
  // that way.
  return a < b ? a : b;
}
