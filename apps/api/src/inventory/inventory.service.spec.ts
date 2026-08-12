import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { InventoryEventInput, InventoryItemInput } from '@kitchen/contracts';
import { AppError } from '../common/errors.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { eq } from 'drizzle-orm';
import { inventoryEvents, storageLocations } from '../db/schema.js';
import {
  createTestContext,
  seedUser,
  seedHousehold,
  seedIngredients,
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
    brand: null,
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
  let seededIngredients: string[] = [];
  let hhA: string;
  let hhB: string;
  let locA: string;
  let ingA: string;
  let ingB: string;
  let ingC: string;
  let ingD: string;
  let ingE: string;
  let ingF: string;
  let ingG: string;
  let ingH: string;
  let ingI: string;

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

    // Owned by this run. These used to be borrowed from the global catalog with
    // an unordered `limit(6)`, which meant the fixtures changed identity
    // whenever anything else wrote to `ingredients` — a parallel suite creating
    // a row, or an embedding backfill rewriting the heap, was enough to make
    // two of them the same ingredient and turn bulkCreate into a merge.
    seededIngredients = await seedIngredients(ctx.db, 9);
    [ingA, ingB, ingC, ingD, ingE, ingF, ingG, ingH, ingI] = seededIngredients as [
      string, string, string, string, string, string, string, string, string,
    ];
  });

  afterAll(async () => {
    await cleanup(ctx.db, {
      households: [hhA, hhB],
      users: [userId],
      ingredients: seededIngredients,
    });
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

  it('keeps a brand while every addition to the slot agrees, then drops it', async () => {
    const [created] = await service.bulkCreate(hhA, userId, {
      items: [
        itemInput({
          ingredientId: ingG,
          locationId: locA,
          quantity: 1,
          unit: 'l',
          brand: 'Al Marai',
          source: 'barcode',
        }),
      ],
    });
    expect(created!.brand).toBe('Al Marai');

    const [same] = await service.bulkCreate(hhA, userId, {
      items: [
        itemInput({ ingredientId: ingG, locationId: locA, quantity: 1, unit: 'l', brand: 'Al Marai' }),
      ],
    });
    expect(same!.id).toBe(created!.id);
    expect(same!.brand).toBe('Al Marai');

    // A second brand now shares the slot, so the row can no longer claim either.
    const [mixed] = await service.bulkCreate(hhA, userId, {
      items: [
        itemInput({ ingredientId: ingG, locationId: locA, quantity: 1, unit: 'l', brand: 'Nadec' }),
      ],
    });
    expect(mixed!.id).toBe(created!.id);
    expect(mixed!.brand).toBeNull();
    // The pooling rule must not disturb the quantity ledger.
    expect(mixed!.quantity).toBe(3);
  });

  it('does not label pooled stock with a brand that arrived later', async () => {
    const [created] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingH, locationId: locA, quantity: 2, unit: 'piece' })],
    });
    expect(created!.brand).toBeNull();

    // The existing two units are not Al Marai, so adopting the incoming brand
    // would mislabel them.
    const [merged] = await service.bulkCreate(hhA, userId, {
      items: [
        itemInput({
          ingredientId: ingH,
          locationId: locA,
          quantity: 1,
          unit: 'piece',
          brand: 'Al Marai',
        }),
      ],
    });
    expect(merged!.id).toBe(created!.id);
    expect(merged!.brand).toBeNull();
  });

  it('corrects and clears a brand through update', async () => {
    const [created] = await service.bulkCreate(hhA, userId, {
      items: [
        itemInput({
          ingredientId: ingI,
          locationId: locA,
          quantity: 1,
          unit: 'piece',
          brand: 'Al Wadi',
        }),
      ],
    });

    const corrected = await service.update(hhA, userId, created!.id, { brand: 'Al Wadi' });
    expect(corrected.brand).toBe('Al Wadi');
    // Quantity must be untouched by a metadata-only edit.
    expect(corrected.quantity).toBe(1);

    const cleared = await service.update(hhA, userId, created!.id, { brand: null });
    expect(cleared.brand).toBeNull();
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

  /**
   * The capture flow submits a reviewed list and pairs each result with the row
   * the user edited, by position. A bare select has no defined order, so this
   * used to come back shuffled — attaching quantities and expiry dates to the
   * wrong ingredients, and showing up only as an occasional failure elsewhere
   * in this file.
   */
  it('returns bulk-created items in the order they were submitted', async () => {
    // Its own ingredients: every other fixture already holds stock at locA, and
    // merging into it would hide the ordering this asserts.
    const fresh = await seedIngredients(ctx.db, 4);
    seededIngredients.push(...fresh);
    const submitted = fresh.map((ingredientId, i) =>
      itemInput({ ingredientId, locationId: locA, quantity: i + 1, unit: 'piece' }),
    );

    const created = await service.bulkCreate(hhA, userId, { items: submitted });

    expect(created.map((item) => item.ingredient.id)).toEqual(fresh);
    expect(created.map((item) => item.quantity)).toEqual([1, 2, 3, 4]);
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

  it('orders sync events by instant, not by the text of their timestamp', async () => {
    const [item] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingF, locationId: locA, quantity: 2, unit: 'piece' })],
    });
    const itemId = item!.id;

    // `isoDateTimeSchema` accepts UTC offsets, so a client in Riyadh sends
    // `+03:00`. `10:00+03:00` is 07:00Z — an hour *before* `09:00Z` — but sorts
    // after it as a string. Quantities floor at zero, so replaying the two in
    // the wrong order is not merely cosmetic: it changes the result.
    const result = await service.sync(hhA, userId, [
      {
        clientEventId: randomUUID(),
        itemId,
        delta: -5,
        unit: 'piece',
        reason: 'consumed',
        mealPlanEntryId: null,
        occurredAt: '2026-03-01T09:00:00.000Z',
      },
      {
        clientEventId: randomUUID(),
        itemId,
        delta: 4,
        unit: 'piece',
        reason: 'purchased',
        mealPlanEntryId: null,
        occurredAt: '2026-03-01T10:00:00.000+03:00',
      },
    ]);

    expect(result.applied.length).toBe(2);
    // True order is purchase (07:00Z) then consumption (09:00Z): 2 + 4 = 6,
    // then 6 - 5 = 1. Sorting the strings gives 2 - 5 -> floored to 0, + 4 = 4.
    expect(result.items.find((i) => i.id === itemId)!.quantity).toBe(1);
  });

  it('keeps the event ledger consistent when two updates race', async () => {
    const [item] = await service.bulkCreate(hhA, userId, {
      items: [itemInput({ ingredientId: ingD, locationId: locA, quantity: 10, unit: 'piece' })],
    });
    const itemId = item!.id;

    // Each update writes a `corrected` event holding `new - current`. If the
    // read that produces `current` happens outside the writing transaction,
    // both updates read 10 and both deltas are measured from it — so the ledger
    // stops explaining the stored quantity.
    await Promise.all([
      service.update(hhA, userId, itemId, { quantity: 7 }),
      service.update(hhA, userId, itemId, { quantity: 4 }),
    ]);

    const events = await ctx.db
      .select({ delta: inventoryEvents.delta })
      .from(inventoryEvents)
      .where(eq(inventoryEvents.itemId, itemId));
    const sum = events.reduce((acc, e) => acc + Number(e.delta), 0);

    const listed = await service.list(hhA, { limit: 50, sort: 'expiry' });
    const finalQuantity = listed.items.find((i) => i.id === itemId)!.quantity;

    // Whichever order they serialise in, the invariant is the same: the events
    // sum to the stored quantity.
    // `bulkCreate` writes the opening `purchased` event, so the ledger is complete.
    expect(sum).toBeCloseTo(finalQuantity, 3);
  });
});
