import { and, eq, inArray, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AddShoppingItemsRequest,
  CheckoutShoppingRequest,
  Ingredient,
  InventoryItem,
  ShoppingListItem,
  ToggleShoppingItemRequest,
} from '@kitchen/contracts';
import { AppError } from '../../common/errors.js';
import { DB, type Database } from '../../db/index.js';
import { ingredients, inventoryEvents, inventoryItems, shoppingListItems } from '../../db/schema.js';

type IngredientRow = typeof ingredients.$inferSelect;

function toIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    canonicalNameEn: row.canonicalNameEn,
    canonicalNameAr: row.canonicalNameAr,
    category: row.category,
    defaultUnit: row.defaultUnit,
    aliases: row.aliases ?? [],
    isStaple: row.isStaple,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ShoppingService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(householdId: string): Promise<ShoppingListItem[]> {
    const rows = await this.db
      .select({ item: shoppingListItems, ingredient: ingredients })
      .from(shoppingListItems)
      .innerJoin(ingredients, eq(shoppingListItems.ingredientId, ingredients.id))
      .where(eq(shoppingListItems.householdId, householdId));
    return rows.map((r) => this.toItem(r.item, r.ingredient));
  }

  async add(householdId: string, body: AddShoppingItemsRequest): Promise<ShoppingListItem[]> {
    const inserted = await this.db
      .insert(shoppingListItems)
      .values(
        body.items.map((i) => ({
          householdId,
          planId: body.planId,
          ingredientId: i.ingredientId,
          quantity: i.quantity.toFixed(3),
          unit: i.unit,
          purchased: false,
        })),
      )
      .returning();

    const ingredientRows = await this.db
      .select()
      .from(ingredients)
      .where(inArray(ingredients.id, inserted.map((i) => i.ingredientId)));
    const byId = new Map(ingredientRows.map((r) => [r.id, r]));
    return inserted.map((item) => this.toItem(item, byId.get(item.ingredientId)!));
  }

  async toggle(
    householdId: string,
    id: string,
    body: ToggleShoppingItemRequest,
  ): Promise<ShoppingListItem> {
    const [updated] = await this.db
      .update(shoppingListItems)
      .set({ purchased: body.purchased, purchasedAt: body.purchased ? new Date() : null })
      .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.householdId, householdId)))
      .returning();
    if (!updated) throw AppError.notFound('errors.NOT_FOUND');
    const [ingredient] = await this.db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, updated.ingredientId))
      .limit(1);
    return this.toItem(updated, ingredient!);
  }

  /** Moves purchased items into inventory as `purchased` events (spec §5.2/§4.2). */
  async checkout(householdId: string, body: CheckoutShoppingRequest): Promise<InventoryItem[]> {
    return this.db.transaction(async (tx) => {
      const items = await tx
        .select()
        .from(shoppingListItems)
        .where(
          and(
            eq(shoppingListItems.householdId, householdId),
            inArray(shoppingListItems.id, body.itemIds),
          ),
        );
      if (items.length === 0) throw AppError.notFound('errors.NOT_FOUND');

      const results: InventoryItem[] = [];
      for (const item of items) {
        const [invItem] = await tx
          .insert(inventoryItems)
          .values({
            householdId,
            ingredientId: item.ingredientId,
            locationId: body.locationId,
            quantity: item.quantity,
            unit: item.unit,
            source: 'receipt',
          })
          .onConflictDoUpdate({
            target: [
              inventoryItems.householdId,
              inventoryItems.ingredientId,
              inventoryItems.locationId,
              inventoryItems.unit,
            ],
            set: {
              quantity: sql`${inventoryItems.quantity} + ${item.quantity}`,
              updatedAt: new Date(),
            },
          })
          .returning();

        await tx.insert(inventoryEvents).values({
          itemId: invItem!.id,
          householdId,
          delta: item.quantity,
          unit: item.unit,
          reason: 'purchased',
        });
        await tx
          .update(shoppingListItems)
          .set({ purchased: true, purchasedAt: new Date() })
          .where(eq(shoppingListItems.id, item.id));

        const [ingredient] = await tx
          .select()
          .from(ingredients)
          .where(eq(ingredients.id, item.ingredientId))
          .limit(1);
        results.push(this.toInventoryItem(invItem!, ingredient!));
      }
      return results;
    });
  }

  private toItem(
    item: typeof shoppingListItems.$inferSelect,
    ingredient: IngredientRow,
  ): ShoppingListItem {
    return {
      id: item.id,
      planId: item.planId,
      ingredientId: item.ingredientId,
      nameEn: ingredient.canonicalNameEn,
      nameAr: ingredient.canonicalNameAr,
      quantity: Number(item.quantity),
      unit: item.unit,
      purchased: item.purchased,
      purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString() : null,
    };
  }

  private toInventoryItem(
    item: typeof inventoryItems.$inferSelect,
    ingredient: IngredientRow,
  ): InventoryItem {
    return {
      id: item.id,
      householdId: item.householdId,
      ingredient: toIngredient(ingredient),
      brand: item.brand,
      label: item.label,
      locationId: item.locationId,
      quantity: Number(item.quantity),
      unit: item.unit,
      expiresAt: item.expiresAt ?? null,
      source: item.source,
      confidence: item.confidence != null ? Number(item.confidence) : null,
      photoKey: item.photoKey,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
