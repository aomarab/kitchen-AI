import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { AppError } from '../../common/errors.js';
import {
  inventoryEvents,
  inventoryItems,
  shoppingListItems,
  storageLocations,
} from '../../db/schema.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedIngredients,
  seedUser,
  type TestContext,
} from '../../testing/harness.js';
import { ShoppingService } from './shopping.service.js';

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError(${code}) but none was thrown`);
}

describe('ShoppingService.checkout (live DB)', () => {
  let ctx: TestContext;
  let service: ShoppingService;
  let userId: string;
  let householdId: string;
  let otherHouseholdId: string;
  let ingredientIds: string[];

  beforeAll(async () => {
    ctx = createTestContext();
    service = new ShoppingService(ctx.db);
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);
    otherHouseholdId = await seedHousehold(ctx.db, userId);
    ingredientIds = await seedIngredients(ctx.db, 1);
  });

  afterAll(async () => {
    await cleanup(ctx.db, {
      households: [householdId, otherHouseholdId],
      users: [userId],
      ingredients: ingredientIds,
    });
    await ctx.client.end();
  });

  it('rejects checkout to another household location and writes no inventory', async () => {
    const [foreignLocation] = await ctx.db
      .insert(storageLocations)
      .values({ householdId: otherHouseholdId, name: 'Their pantry', type: 'pantry' })
      .returning({ id: storageLocations.id });
    const [shoppingItem] = await ctx.db
      .insert(shoppingListItems)
      .values({
        householdId,
        ingredientId: ingredientIds[0]!,
        quantity: '2.000',
        unit: 'piece',
      })
      .returning({ id: shoppingListItems.id });

    await expectAppError(
      service.checkout(householdId, {
        itemIds: [shoppingItem!.id],
        locationId: foreignLocation!.id,
      }),
      'NOT_FOUND',
    );

    const itemRows = await ctx.db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.householdId, householdId));
    const eventRows = await ctx.db
      .select({ id: inventoryEvents.id })
      .from(inventoryEvents)
      .where(eq(inventoryEvents.householdId, householdId));
    const [shoppingRow] = await ctx.db
      .select({ purchased: shoppingListItems.purchased })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.id, shoppingItem!.id));

    expect(itemRows).toHaveLength(0);
    expect(eventRows).toHaveLength(0);
    expect(shoppingRow?.purchased).toBe(false);
  });
});
