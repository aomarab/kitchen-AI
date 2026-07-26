import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { InventoryEventInput, InventoryItemInput } from '@kitchen/contracts';
import { AppError } from '../common/errors.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ingredients, storageLocations } from '../db/schema.js';
import {
  createTestContext,
  seedUser,
  seedHousehold,
  cleanup,
  type TestContext,
} from '../testing/harness.js';
import { InventoryService } from './inventory.service.js';

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

function itemInput(overrides: Partial<InventoryItemInput> & Pick<InventoryItemInput, 'locationId'>): InventoryItemInput {
  return {
    ingredientId: null,
    quantity: 1,
    unit: 'kg',
    expiresAt: null,
    source: 'manual',
    confidence: null,
    photoKey: null,
    ...overrides,
  };
}

describe('InventoryService (live DB)', () => {
  let ctx: TestContext;
  let service: InventoryService;
  let userId: string;
  let hhA: string;
  let hhB: string;
  let locA: string;
  let ingA: string;
  let ingB: string;
  let ingC: string;
  let ingD: string;
  let ingE: string;

  beforeAll(async () => {
    ctx = createTestContext();
    service = new InventoryService(ctx.db, new CatalogService(ctx.db));
    userId = await seedUser(ctx.db);
    hhA = await seedHousehold(ctx.db, userId, 'owner');
    hhB = await seedHousehold(ctx.db, userId, 'owner');

    const [l1] = await ctx.db
      .insert(storageLocations)
      .values({ householdId: hhA, name: 'Fridge A', type: 'fridge' })
      .returning({ id: storageLocations.id });
    locA = l1!.id;

    const rows = await ctx.db.select({ id: ingredients.id }).from(ingredients).limit(5);
    ingA = rows[0]!.id;
    ingB = rows[1]!.id;
    ingC = rows[2]!.id;
    ingD = rows[3]!.id;
    ingE = rows[4]!.id;
  });

  afterAll(async () => {
    await cleanup(ctx.db, { households: [hhA, hhB], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('merges a compatible unit by converting into the existing item', async () => {
    const [created] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingA, locationId: locA, quantity: 1, unit: 'kg' })],
    });
    expect(created!.quantity).toBe(1);
    expect(created!.unit).toBe('kg');

    const [merged] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingA, locationId: locA, quantity: 500, unit: 'g' })],
    });
    // 1kg + 500g => 1.5kg, kept in the existing item's unit.
    expect(merged!.id).toBe(created!.id);
    expect(merged!.quantity).toBe(1.5);
    expect(merged!.unit).toBe('kg');
  });

  it('rejects an incompatible unit for an existing item', async () => {
    await expectAppError(
      service.bulkCreate(hhA, userId, {
        items: [itemInput({ ingredientId: ingA, locationId: locA, quantity: 3, unit: 'piece' })],
      }),
      'VALIDATION_FAILED',
    );
  });

  it('applies a sync event once and reports a replayed clientEventId as duplicate', async () => {
    const [item] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingB, locationId: locA, quantity: 4, unit: 'piece' })],
    });
    const itemId = item!.id;

    const event: InventoryEventInput = {
      clientEventId: randomUUID(),
      itemId,
      delta: -1,
      unit: 'piece',
      reason: 'consumed',
      mealPlanEntryId: null,
      occurredAt: new Date().toISOString(),
    };

    const first = await service.sync(hhA, userId, [event]);
    expect(first.applied).toEqual([event.clientEventId]);
    expect(first.duplicate).toEqual([]);
    expect(first.rejected).toEqual([]);
    expect(first.items.find((i) => i.id === itemId)!.quantity).toBe(3);

    // Replay the exact same event — reported as duplicate, not double-applied.
    const replay = await service.sync(hhA, userId, [event]);
    expect(replay.applied).toEqual([]);
    expect(replay.duplicate).toEqual([event.clientEventId]);
    expect(replay.rejected).toEqual([]);
    expect(replay.items.find((i) => i.id === itemId)!.quantity).toBe(3);
  });

  it('converges multiple distinct events applied together', async () => {
    const [item] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingC, locationId: locA, quantity: 10, unit: 'piece' })],
    });
    const itemId = item!.id;

    const result = await service.sync(hhA, userId, [
      {
        clientEventId: randomUUID(),
        itemId,
        delta: -4,
        unit: 'piece',
        reason: 'consumed',
        mealPlanEntryId: null,
        occurredAt: new Date(Date.now() - 1000).toISOString(),
      },
      {
        clientEventId: randomUUID(),
        itemId,
        delta: 3,
        unit: 'piece',
        reason: 'purchased',
        mealPlanEntryId: null,
        occurredAt: new Date().toISOString(),
      },
    ]);
    expect(result.applied.length).toBe(2);
    // 10 - 4 + 3 => 9
    expect(result.items.find((i) => i.id === itemId)!.quantity).toBe(9);
  });

  it('keeps households isolated for reads and writes', async () => {
    const [item] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingA, locationId: locA, quantity: 2, unit: 'kg' })],
    });
    const itemId = item!.id;

    // hhB cannot see hhA's item.
    const listB = await service.list(hhB, { limit: 50, sort: 'expiry' });
    expect(listB.items.some((i) => i.id === itemId)).toBe(false);

    // hhB cannot update or delete hhA's item.
    await expectAppError(service.update(hhB, userId, itemId, { quantity: 99 }), 'NOT_FOUND');
    await expectAppError(service.delete(hhB, itemId), 'NOT_FOUND');

    // A sync targeting hhA's item from hhB is rejected as item_not_found (a
    // cross-household id is indistinguishable from a missing one on purpose),
    // never applied — so the client surfaces it rather than dropping the edit.
    const clientEventId = randomUUID();
    const crossSync = await service.sync(hhB, userId, [
      {
        clientEventId,
        itemId,
        delta: -1,
        unit: 'kg',
        reason: 'consumed',
        mealPlanEntryId: null,
        occurredAt: new Date().toISOString(),
      },
    ]);
    expect(crossSync.applied).toEqual([]);
    expect(crossSync.duplicate).toEqual([]);
    expect(crossSync.rejected).toEqual([{ clientEventId, reason: 'item_not_found' }]);

    // Fetching by id is scoped the same way, so it cannot be used to probe for
    // ids belonging to another household.
    await expectAppError(service.get(hhB, itemId), 'NOT_FOUND');
  });

  it('fetches a single item by id without depending on list pagination', async () => {
    // The mobile item screen deep-links straight to an id, so it must resolve
    // even when the item falls outside the first page of the default listing.
    const created = await service.bulkCreate(hhA, userId, {
      items: [
        itemInput({ ingredientId: ingA, locationId: locA, quantity: 3, unit: 'kg' }),
        itemInput({ ingredientId: ingE, locationId: locA, quantity: 4, unit: 'piece' }),
      ],
    });
    const target = created[1]!;

    const fetched = await service.get(hhA, target.id);
    expect(fetched.id).toBe(target.id);
    expect(fetched.quantity).toBe(4);
    expect(fetched.ingredient.id).toBe(ingE);

    await expectAppError(service.get(hhA, randomUUID()), 'NOT_FOUND');
  });

  it('reports an incompatible-unit sync event as rejected rather than swallowing it', async () => {
    const [item] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingD, locationId: locA, quantity: 5, unit: 'piece' })],
    });
    const itemId = item!.id;

    const clientEventId = randomUUID();
    const result = await service.sync(hhA, userId, [
      {
        clientEventId,
        itemId,
        delta: -1,
        unit: 'kg', // mass against the item's count dimension → cannot convert
        reason: 'consumed',
        mealPlanEntryId: null,
        occurredAt: new Date().toISOString(),
      },
    ]);

    expect(result.applied).toEqual([]);
    expect(result.duplicate).toEqual([]);
    expect(result.rejected).toEqual([{ clientEventId, reason: 'incompatible_unit' }]);

    // The item's quantity is untouched — the edit was not silently applied.
    const listed = await service.list(hhA, { limit: 50, sort: 'expiry' });
    expect(listed.items.find((i) => i.id === itemId)!.quantity).toBe(5);
  });
});
