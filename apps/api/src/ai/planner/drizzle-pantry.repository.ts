import { eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { Unit } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { ingredients, inventoryItems } from '../../db/schema.js';
import { buildSnapshot, type InventoryRow, type PantryPort } from './pantry-snapshot.js';
import type { PantrySnapshot } from './types.js';

/**
 * Stage A data access: reads a household's live inventory joined with the
 * catalog and folds it into a deterministic {@link PantrySnapshot}. Pure
 * aggregation lives in {@link buildSnapshot}; this class only fetches rows.
 */
@Injectable()
export class DrizzlePantryRepository implements PantryPort {
  constructor(@Inject(DB) private readonly db: Database) {}

  async snapshot(householdId: string): Promise<PantrySnapshot> {
    const rows = await this.db
      .select({
        ingredientId: inventoryItems.ingredientId,
        nameEn: ingredients.canonicalNameEn,
        nameAr: ingredients.canonicalNameAr,
        defaultUnit: ingredients.defaultUnit,
        isStaple: ingredients.isStaple,
        quantity: inventoryItems.quantity,
        unit: inventoryItems.unit,
        expiresOn: inventoryItems.expiresAt,
      })
      .from(inventoryItems)
      .innerJoin(ingredients, eq(inventoryItems.ingredientId, ingredients.id))
      .where(eq(inventoryItems.householdId, householdId));

    const mapped: InventoryRow[] = rows.map((r) => ({
      ingredientId: r.ingredientId,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      defaultUnit: r.defaultUnit as Unit,
      isStaple: r.isStaple,
      quantity: Number(r.quantity),
      unit: r.unit as Unit,
      expiresOn: r.expiresOn ?? null,
    }));

    return buildSnapshot(mapped);
  }
}
