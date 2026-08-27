import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cookingTimerSchema, MAX_TIMER_DURATION_SEC } from '@kitchen/contracts';
import { cookingTimers } from '../db/schema.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { AppError } from '../common/errors.js';
import { TimersService } from './timers.service.js';

const T0 = new Date('2026-08-27T10:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('TimersService (live DB)', () => {
  let ctx: TestContext;
  let service: TimersService;
  let userId: string;
  let hhA: string;
  let hhB: string;

  beforeAll(async () => {
    ctx = createTestContext();
    service = new TimersService(ctx.db);
    userId = await seedUser(ctx.db, `test+timers-${randomUUID()}@example.com`);
    hhA = await seedHousehold(ctx.db, userId, 'owner');
    hhB = await seedHousehold(ctx.db, userId, 'owner');
  });

  beforeEach(async () => {
    await ctx.db.delete(cookingTimers).where(eq(cookingTimers.householdId, hhA));
    await ctx.db.delete(cookingTimers).where(eq(cookingTimers.householdId, hhB));
  });

  afterAll(async () => {
    await ctx.db.delete(cookingTimers).where(eq(cookingTimers.householdId, hhA));
    await ctx.db.delete(cookingTimers).where(eq(cookingTimers.householdId, hhB));
    await cleanup(ctx.db, { households: [hhA, hhB], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('starts a timer running with a deadline the client can count down from', async () => {
    const timer = await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    expect(timer).toMatchObject({ label: 'Rice', durationSec: 600, status: 'running' });
    expect(timer.endsAt).toBe(at(600).toISOString());
    expect(cookingTimerSchema.safeParse(timer).success).toBe(true);
  });

  it('derives the countdown from the deadline as time passes', async () => {
    await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    const [timer] = await service.list(hhA, at(60));
    expect(timer!.remainingSec).toBe(540);
  });

  it('reports a lapsed timer as done even though nothing swept the table', async () => {
    await service.create(hhA, { label: 'Tea', durationSec: 120 }, T0);
    const [timer] = await service.list(hhA, at(200));
    expect(timer).toMatchObject({ status: 'done', endsAt: null, remainingSec: 0 });

    // The stored row is still `running` — expiry is a projection, not a sweep.
    const rows = await ctx.db
      .select()
      .from(cookingTimers)
      .where(eq(cookingTimers.householdId, hhA));
    expect(rows[0]!.status).toBe('running');
  });

  it('freezes the countdown while paused and restarts it from where it stopped', async () => {
    const created = await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    const paused = await service.update(hhA, created.id, { action: 'pause' }, at(60));
    expect(paused).toMatchObject({ status: 'paused', endsAt: null, remainingSec: 540 });

    // Five minutes of wall clock pass; a paused timer must not lose them.
    const [stillPaused] = await service.list(hhA, at(360));
    expect(stillPaused!.remainingSec).toBe(540);

    const resumed = await service.update(hhA, created.id, { action: 'resume' }, at(360));
    expect(resumed.status).toBe('running');
    expect(resumed.endsAt).toBe(at(900).toISOString());
  });

  it('adds a minute to a running timer without shifting it off the current clock', async () => {
    const created = await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    const extended = await service.update(
      hhA,
      created.id,
      { action: 'extend', seconds: 60 },
      at(60),
    );
    expect(extended.remainingSec).toBe(600);
    expect(extended.durationSec).toBe(660);
    expect(extended.endsAt).toBe(at(660).toISOString());
  });

  it('adds time to a paused timer without starting it', async () => {
    const created = await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    await service.update(hhA, created.id, { action: 'pause' }, at(60));
    const extended = await service.update(
      hhA,
      created.id,
      { action: 'extend', seconds: 60 },
      at(90),
    );
    expect(extended).toMatchObject({ status: 'paused', endsAt: null, remainingSec: 600 });
  });

  it('restarts a finished timer when the cook asks for another minute', async () => {
    const created = await service.create(hhA, { label: 'Tea', durationSec: 120 }, T0);
    const revived = await service.update(
      hhA,
      created.id,
      { action: 'extend', seconds: 60 },
      at(200),
    );
    expect(revived).toMatchObject({ status: 'running', remainingSec: 60 });
    expect(revived.endsAt).toBe(at(260).toISOString());
  });

  it('refuses to extend past the maximum supported duration', async () => {
    const created = await service.create(
      hhA,
      { label: 'Stock', durationSec: MAX_TIMER_DURATION_SEC },
      T0,
    );
    await expect(
      service.update(hhA, created.id, { action: 'extend', seconds: 60 }, at(1)),
    ).rejects.toMatchObject({ code: 'CONFLICT', messageKey: 'errors.timerTooLong' });
  });

  it('refuses to pause a timer that is not running, including a lapsed one', async () => {
    const created = await service.create(hhA, { label: 'Tea', durationSec: 120 }, T0);
    await expect(
      service.update(hhA, created.id, { action: 'pause' }, at(200)),
    ).rejects.toMatchObject({ code: 'CONFLICT', messageKey: 'errors.timerNotRunning' });
  });

  it('refuses to resume a timer that is already running', async () => {
    const created = await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    await expect(
      service.update(hhA, created.id, { action: 'resume' }, at(60)),
    ).rejects.toMatchObject({ code: 'CONFLICT', messageKey: 'errors.timerNotPaused' });
  });

  it('treats stopping an already-finished timer as a no-op, not a conflict', async () => {
    const created = await service.create(hhA, { label: 'Tea', durationSec: 120 }, T0);
    const stopped = await service.update(hhA, created.id, { action: 'stop' }, at(200));
    expect(stopped).toMatchObject({ status: 'done', endsAt: null, remainingSec: 0 });

    const again = await service.update(hhA, created.id, { action: 'stop' }, at(300));
    expect(again.status).toBe('done');
  });

  it('materializes the projection on write, so a lapsed row stops being running', async () => {
    const created = await service.create(hhA, { label: 'Tea', durationSec: 120 }, T0);
    await service.update(hhA, created.id, { action: 'stop' }, at(200));
    const rows = await ctx.db.select().from(cookingTimers).where(eq(cookingTimers.id, created.id));
    expect(rows[0]).toMatchObject({ status: 'done', endsAt: null, remainingSec: 0 });
  });

  it('deletes a timer and reports a missing one as not found', async () => {
    const created = await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    await service.remove(hhA, created.id);
    expect(await service.list(hhA, at(1))).toEqual([]);
    await expect(service.remove(hhA, created.id)).rejects.toBeInstanceOf(AppError);
  });

  it('keeps each household isolated on read, write and delete', async () => {
    const mine = await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    await service.create(hhB, { label: 'Soup', durationSec: 900 }, T0);

    expect((await service.list(hhA, at(1))).map((t) => t.label)).toEqual(['Rice']);
    await expect(
      service.update(hhB, mine.id, { action: 'pause' }, at(1)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.remove(hhB, mine.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists concurrent timers in the order they were started', async () => {
    await service.create(hhA, { label: 'Rice', durationSec: 600 }, T0);
    await service.create(hhA, { label: 'Chicken', durationSec: 1800 }, at(1));
    await service.create(hhA, { label: 'Tea', durationSec: 180 }, at(2));
    expect((await service.list(hhA, at(3))).map((t) => t.label)).toEqual([
      'Rice',
      'Chicken',
      'Tea',
    ]);
  });
});
