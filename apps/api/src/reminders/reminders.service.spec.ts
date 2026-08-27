import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { reminderSettings } from '../db/schema.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { RemindersService } from './reminders.service.js';

describe('RemindersService (live DB)', () => {
  let ctx: TestContext;
  let service: RemindersService;
  let userId: string;
  let hhA: string;
  let hhB: string;

  beforeAll(async () => {
    ctx = createTestContext();
    service = new RemindersService(ctx.db);
    userId = await seedUser(ctx.db);
    hhA = await seedHousehold(ctx.db, userId, 'owner');
    hhB = await seedHousehold(ctx.db, userId, 'owner');
  });

  afterAll(async () => {
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, hhA));
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, hhB));
    await cleanup(ctx.db, { households: [hhA, hhB], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('returns fully-defaulted settings for a household with no row yet', async () => {
    const settings = await service.get(hhA);
    expect(settings).toEqual({
      householdId: hhA,
      breakEnabled: true,
      stretchEnabled: true,
      morningEnabled: true,
      hydrationEnabled: true,
      breakCadenceMinutes: 60,
      stretchCadenceMinutes: 90,
      hydrationGoalCups: 8,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      timeZone: 'UTC',
    });
  });

  it('persists a patch and merges it over the defaults', async () => {
    const updated = await service.update(hhA, {
      breakEnabled: false,
      breakCadenceMinutes: 90,
      hydrationGoalCups: 10,
    });
    expect(updated).toMatchObject({
      householdId: hhA,
      breakEnabled: false,
      breakCadenceMinutes: 90,
      hydrationGoalCups: 10,
      stretchEnabled: true,
      stretchCadenceMinutes: 90,
    });

    const reread = await service.get(hhA);
    expect(reread.breakEnabled).toBe(false);
    expect(reread.breakCadenceMinutes).toBe(90);
    expect(reread.hydrationGoalCups).toBe(10);
  });

  it('stores a stretch cadence without touching the break cadence', async () => {
    // The two run on independent clocks, so patching one must not move the
    // other — the bug a shared column would have produced.
    await service.update(hhA, { breakCadenceMinutes: 30, stretchCadenceMinutes: 120 });
    const reread = await service.get(hhA);
    expect(reread.breakCadenceMinutes).toBe(30);
    expect(reread.stretchCadenceMinutes).toBe(120);
  });

  it('updates the same row on a second patch instead of inserting a duplicate', async () => {
    await service.update(hhA, { quietHoursStart: 21 });
    const rows = await ctx.db
      .select()
      .from(reminderSettings)
      .where(eq(reminderSettings.householdId, hhA));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quietHoursStart).toBe(21);
  });

  it('keeps each household isolated', async () => {
    await service.update(hhA, { morningEnabled: false });
    const other = await service.get(hhB);
    expect(other.morningEnabled).toBe(true);
  });
});
