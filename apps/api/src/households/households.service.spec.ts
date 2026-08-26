import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { storageLocations } from '../db/schema.js';
import {
  cleanup,
  createTestContext,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { HouseholdsService } from './households.service.js';

describe('HouseholdsService (live DB)', () => {
  let ctx: TestContext;
  let service: HouseholdsService;
  let userId: string;
  const householdIds: string[] = [];

  beforeAll(async () => {
    ctx = createTestContext();
    service = new HouseholdsService(ctx.db);
    userId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { households: householdIds, users: [userId] });
    await ctx.client.end();
  });

  /**
   * Every inventory item requires a `locationId`, and nothing in either client
   * creates a location. A household that starts with none is therefore a
   * household that cannot save a scan at all — the review screen has no place
   * to put anything.
   */
  it('gives a new household somewhere to put food', async () => {
    const household = await service.create(userId, { name: 'Fresh household' });
    householdIds.push(household.id);

    const places = await ctx.db
      .select({ name: storageLocations.name, type: storageLocations.type })
      .from(storageLocations)
      .where(eq(storageLocations.householdId, household.id));

    expect(places.map((p) => p.type).sort()).toEqual(['freezer', 'fridge', 'pantry']);
  });

  it('does not share places between households', async () => {
    const a = await service.create(userId, { name: 'Household A' });
    const b = await service.create(userId, { name: 'Household B' });
    householdIds.push(a.id, b.id);

    const inA = await ctx.db
      .select({ id: storageLocations.id })
      .from(storageLocations)
      .where(eq(storageLocations.householdId, a.id));
    const inB = await ctx.db
      .select({ id: storageLocations.id })
      .from(storageLocations)
      .where(eq(storageLocations.householdId, b.id));

    expect(inA).toHaveLength(3);
    expect(inB).toHaveLength(3);
    expect(inA.map((r) => r.id).some((id) => inB.map((r) => r.id).includes(id))).toBe(false);
  });
});
