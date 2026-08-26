import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import { inventoryEvents, inventoryItems } from '../db/schema.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedIngredients,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { LocationsService } from './locations.service.js';

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`expected AppError(${code}) but none was thrown`);
}

describe('LocationsService (live DB)', () => {
  let ctx: TestContext;
  let service: LocationsService;
  let userId: string;
  let householdId: string;
  let ingredientIds: string[];

  beforeAll(async () => {
    ctx = createTestContext();
    service = new LocationsService(ctx.db);
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);
    ingredientIds = await seedIngredients(ctx.db, 3);
  });

  afterAll(async () => {
    await cleanup(ctx.db, {
      households: [householdId],
      users: [userId],
      ingredients: ingredientIds,
    });
    await ctx.client.end();
  });

  async function makeLocation(name: string) {
    return service.create(householdId, { name, type: 'pantry' });
  }

  async function putItem(
    locationId: string,
    ingredientId: string,
    quantity: number,
    opts: { unit?: 'kg' | 'piece'; expiresAt?: string | null } = {},
  ): Promise<string> {
    const [row] = await ctx.db
      .insert(inventoryItems)
      .values({
        householdId,
        ingredientId,
        locationId,
        quantity: String(quantity),
        unit: opts.unit ?? 'kg',
        source: 'manual',
        expiresAt: opts.expiresAt ?? null,
      })
      .returning({ id: inventoryItems.id });
    if (!row) throw new Error('failed to seed item');
    await ctx.db.insert(inventoryEvents).values({
      itemId: row.id,
      householdId,
      delta: String(quantity),
      unit: opts.unit ?? 'kg',
      reason: 'added',
    });
    return row.id;
  }

  it('deletes a place that holds nothing', async () => {
    const empty = await makeLocation('Empty shelf');
    await service.delete(householdId, empty.id);
    const remaining = await service.list(householdId);
    expect(remaining.map((l) => l.id)).not.toContain(empty.id);
  });

  it('refuses to delete a place that still holds food, and says how much', async () => {
    const shelf = await makeLocation('Full shelf');
    await putItem(shelf.id, ingredientIds[0]!, 2);
    await putItem(shelf.id, ingredientIds[1]!, 5);

    const error = await expectAppError(service.delete(householdId, shelf.id), 'CONFLICT');
    expect(error.details).toMatchObject({ reason: 'location_not_empty', itemCount: 2 });

    // The refusal has to be a refusal: the food is still there.
    const survivors = await ctx.db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.locationId, shelf.id));
    expect(survivors).toHaveLength(2);

    await service.delete(householdId, shelf.id, { moveTo: (await makeLocation('Sink')).id });
  });

  it('moves the food when a destination is given, instead of destroying it', async () => {
    const from = await makeLocation('Old pantry');
    const to = await makeLocation('New pantry');
    const itemId = await putItem(from.id, ingredientIds[0]!, 3);

    await service.delete(householdId, from.id, { moveTo: to.id });

    const [moved] = await ctx.db
      .select({ locationId: inventoryItems.locationId, quantity: inventoryItems.quantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId));
    expect(moved?.locationId).toBe(to.id);
    expect(Number(moved?.quantity)).toBe(3);
  });

  it('merges onto the item already there rather than failing on the unique slot', async () => {
    const from = await makeLocation('Fridge being retired');
    const to = await makeLocation('Freezer');
    const source = await putItem(from.id, ingredientIds[2]!, 2);
    const target = await putItem(to.id, ingredientIds[2]!, 5);

    await service.delete(householdId, from.id, { moveTo: to.id });

    const rows = await ctx.db
      .select({ id: inventoryItems.id, quantity: inventoryItems.quantity })
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.locationId, to.id), eq(inventoryItems.ingredientId, ingredientIds[2]!)),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(target);
    expect(Number(rows[0]?.quantity)).toBe(7);

    // The ledger is the source of truth for the quantity, so the merged item
    // has to inherit the history that produced its share of it — otherwise the
    // events stop summing to the quantity and offline replay drifts.
    const events = await ctx.db
      .select({ delta: inventoryEvents.delta })
      .from(inventoryEvents)
      .where(eq(inventoryEvents.itemId, target));
    expect(events.map((e) => Number(e.delta)).reduce((a, b) => a + b, 0)).toBe(7);
    const orphaned = await ctx.db
      .select({ id: inventoryEvents.id })
      .from(inventoryEvents)
      .where(eq(inventoryEvents.itemId, source));
    expect(orphaned).toHaveLength(0);
  });

  it('keeps the soonest expiry when two items merge', async () => {
    const from = await makeLocation('Door shelf');
    const to = await makeLocation('Main shelf');
    await putItem(from.id, ingredientIds[1]!, 1, { expiresAt: '2026-09-01' });
    const target = await putItem(to.id, ingredientIds[1]!, 1, { expiresAt: '2026-12-25' });

    await service.delete(householdId, from.id, { moveTo: to.id });

    const [row] = await ctx.db
      .select({ expiresAt: inventoryItems.expiresAt })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, target));
    // Warning late is the dangerous direction, so the earlier date wins.
    expect(row?.expiresAt).toBe('2026-09-01');
  });

  it('refuses to move a place into itself', async () => {
    const shelf = await makeLocation('Self shelf');
    await putItem(shelf.id, ingredientIds[0]!, 1);
    await expectAppError(
      service.delete(householdId, shelf.id, { moveTo: shelf.id }),
      'VALIDATION_FAILED',
    );
    await service.delete(householdId, shelf.id, { moveTo: (await makeLocation('Bin')).id });
  });

  it('refuses a destination belonging to someone else', async () => {
    const otherUser = await seedUser(ctx.db);
    const otherHousehold = await seedHousehold(ctx.db, otherUser);
    const theirs = await service.create(otherHousehold, { name: 'Their shelf', type: 'pantry' });
    const mine = await makeLocation('My shelf');
    await putItem(mine.id, ingredientIds[0]!, 1);

    await expectAppError(service.delete(householdId, mine.id, { moveTo: theirs.id }), 'NOT_FOUND');

    await cleanup(ctx.db, { households: [otherHousehold], users: [otherUser] });
    await service.delete(householdId, mine.id, { moveTo: (await makeLocation('Spare')).id });
  });

  it('renames a place without touching what is inside it', async () => {
    const shelf = await makeLocation('Old name');
    const itemId = await putItem(shelf.id, ingredientIds[0]!, 4);

    const updated = await service.update(householdId, shelf.id, { name: 'New name' });
    expect(updated.name).toBe('New name');
    expect(updated.type).toBe('pantry');

    const [item] = await ctx.db
      .select({ locationId: inventoryItems.locationId })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId));
    expect(item?.locationId).toBe(shelf.id);
  });

  it('changes what kind of place it is', async () => {
    const shelf = await makeLocation('Becomes a freezer');
    const updated = await service.update(householdId, shelf.id, { type: 'freezer' });
    expect(updated.type).toBe('freezer');
    expect(updated.name).toBe('Becomes a freezer');
  });

  it('will not rename a place in another household', async () => {
    const otherUser = await seedUser(ctx.db);
    const otherHousehold = await seedHousehold(ctx.db, otherUser);
    const theirs = await service.create(otherHousehold, { name: 'Theirs', type: 'pantry' });

    await expectAppError(service.update(householdId, theirs.id, { name: 'Mine now' }), 'NOT_FOUND');

    await cleanup(ctx.db, { households: [otherHousehold], users: [otherUser] });
  });
});
