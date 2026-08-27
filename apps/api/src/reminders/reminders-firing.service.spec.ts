import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { REMINDER_MESSAGE_KEYS } from '@kitchen/contracts';
import { reminderOccurrences, reminderSettings } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { RemindersFiringService } from './reminders-firing.service.js';
import { RemindersService } from './reminders.service.js';

/** A UTC instant at a given wall-clock hour, so the injected clock is total. */
const at = (hour: number, minute = 0): Date => new Date(Date.UTC(2026, 7, 27, hour, minute, 0));

describe('RemindersFiringService (live DB)', () => {
  let ctx: TestContext;
  let firing: RemindersFiringService;
  let settings: RemindersService;
  let userId: string;
  let household: string;
  let other: string;

  beforeAll(async () => {
    ctx = createTestContext();
    firing = new RemindersFiringService(ctx.db);
    settings = new RemindersService(ctx.db);
    userId = await seedUser(ctx.db);
    household = await seedHousehold(ctx.db, userId, 'owner');
    other = await seedHousehold(ctx.db, userId, 'owner');
  });

  afterAll(async () => {
    for (const id of [household, other]) {
      await ctx.db.delete(reminderOccurrences).where(eq(reminderOccurrences.householdId, id));
      await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, id));
    }
    await cleanup(ctx.db, { households: [household, other], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    for (const id of [household, other]) {
      await ctx.db.delete(reminderOccurrences).where(eq(reminderOccurrences.householdId, id));
      await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, id));
    }
  });

  it('skips a household that has never saved settings, because a defaulted read is not consent', async () => {
    expect(await firing.sweepHousehold(household, at(12, 0))).toEqual([]);
    // `sweep` is global, so assert on this household rather than on a count
    // that would only hold on an empty database.
    const fired = await firing.sweep(at(12, 0));
    expect(fired.filter((o) => o.householdId === household)).toEqual([]);
  });

  it('greets the household once when its quiet hours end', async () => {
    await settings.update(household, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });

    const first = await firing.sweepHousehold(household, at(7, 1));
    expect(first.map((o) => o.type)).toEqual(['morning']);
    expect(first[0]!.messageKey).toBe(REMINDER_MESSAGE_KEYS.morning);
    expect(first[0]!.channel).toBe('screen');
    expect(first[0]!.acknowledgedAt).toBeNull();

    const second = await firing.sweepHousehold(household, at(9, 0));
    expect(second).toEqual([]);
  });

  it('does not nudge inside quiet hours', async () => {
    await settings.update(household, {});
    expect(await firing.sweepHousehold(household, at(23, 30))).toEqual([]);
    expect(await firing.sweepHousehold(household, at(4, 0))).toEqual([]);
  });

  it('fires a break one cadence after waking and then on the cadence', async () => {
    await settings.update(household, {
      morningEnabled: false,
      hydrationEnabled: false,
      breakCadenceMinutes: 60,
      stretchEnabled: false,
    });

    expect(await firing.sweepHousehold(household, at(7, 45))).toEqual([]);
    const first = await firing.sweepHousehold(household, at(8, 0));
    expect(first.map((o) => o.type)).toEqual(['break']);

    expect(await firing.sweepHousehold(household, at(8, 30))).toEqual([]);
    const second = await firing.sweepHousehold(household, at(9, 0));
    expect(second.map((o) => o.type)).toEqual(['break']);
  });

  it('stops nudging hydration once the day\u2019s goal has been fired', async () => {
    await settings.update(household, {
      morningEnabled: false,
      breakEnabled: false,
      hydrationGoalCups: 2,
      stretchEnabled: false,
    });

    // 15 waking hours split into 3 gaps = a cup every 5 hours, at 12:00 and
    // 17:00, both comfortably before quiet hours begin at 22:00.
    const one = await firing.sweepHousehold(household, at(12, 0));
    expect(one.map((o) => o.type)).toEqual(['hydration']);
    const two = await firing.sweepHousehold(household, at(17, 0));
    expect(two.map((o) => o.type)).toEqual(['hydration']);
    const three = await firing.sweepHousehold(household, at(21, 0));
    expect(three).toEqual([]);
  });

  it('reads quiet hours in the household zone, not the server zone', async () => {
    await settings.update(household, {
      timeZone: 'Asia/Amman',
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });
    // 20:00 UTC is 23:00 in Amman — inside quiet hours there, outside in UTC.
    expect(await firing.sweepHousehold(household, at(20, 0))).toEqual([]);

    await settings.update(other, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });
    expect((await firing.sweepHousehold(other, at(20, 0))).map((o) => o.type)).toEqual(['morning']);
  });

  it('fires a stretch one cadence after waking, on its own clock', async () => {
    await settings.update(household, {
      morningEnabled: false,
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: true,
      stretchCadenceMinutes: 120,
    });

    // Waking is 07:00, so the first stretch is due at 09:00 and the next at
    // 11:00 — never at the 60-minute break cadence the household did not pick.
    expect(await firing.sweepHousehold(household, at(8, 59))).toEqual([]);
    const first = await firing.sweepHousehold(household, at(9, 0));
    expect(first.map((o) => o.type)).toEqual(['stretch']);
    expect(first[0]!.messageKey).toBe(REMINDER_MESSAGE_KEYS.stretch);

    expect(await firing.sweepHousehold(household, at(10, 0))).toEqual([]);
    const second = await firing.sweepHousehold(household, at(11, 0));
    expect(second.map((o) => o.type)).toEqual(['stretch']);
  });

  it('fires a break and a stretch together rather than dropping one', async () => {
    await settings.update(household, {
      morningEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: true,
      breakCadenceMinutes: 60,
      stretchCadenceMinutes: 60,
    });

    const fired = await firing.sweepHousehold(household, at(8, 0));
    expect(fired.map((o) => o.type).sort()).toEqual(['break', 'stretch']);
  });

  it('fires no stretch while its toggle is off, whatever the cadence', async () => {
    await settings.update(household, {
      stretchEnabled: false,
      stretchCadenceMinutes: 30,
    });
    const fired: string[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      fired.push(...(await firing.sweepHousehold(household, at(hour, 0))).map((o) => o.type));
    }
    expect(fired).not.toContain('stretch');
    expect(fired).toContain('morning');
  });

  it('sweeps every household that has saved settings and isolates them', async () => {
    await settings.update(household, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });
    await settings.update(other, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });

    const fired = (await firing.sweep(at(8, 0))).filter((o) =>
      [household, other].includes(o.householdId),
    );
    expect(fired).toHaveLength(2);
    expect(new Set(fired.map((o) => o.householdId))).toEqual(new Set([household, other]));

    const mine = await firing.list(household, undefined, at(8, 5));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.householdId).toBe(household);
  });

  it('lists the current waking day by default and honours an explicit since', async () => {
    await settings.update(household, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });
    await firing.sweepHousehold(household, at(8, 0));

    expect(await firing.list(household, undefined, at(12, 0))).toHaveLength(1);
    // Before the waking window began, so today's nudge is not in it yet.
    expect(await firing.list(household, at(9, 0).toISOString(), at(12, 0))).toHaveLength(0);
  });

  it('counts a cup only once it is acknowledged, and keeps the first timestamp', async () => {
    await settings.update(household, {
      breakEnabled: false,
      morningEnabled: false,
      stretchEnabled: false,
    });
    const [cup] = await firing.sweepHousehold(household, at(12, 0));
    expect(cup!.acknowledgedAt).toBeNull();

    const acked = await firing.acknowledge(household, cup!.id, at(12, 1));
    expect(acked.acknowledgedAt).toBe(at(12, 1).toISOString());

    const again = await firing.acknowledge(household, cup!.id, at(15, 0));
    expect(again.acknowledgedAt).toBe(at(12, 1).toISOString());
  });

  it('refuses to acknowledge another household\u2019s nudge', async () => {
    await settings.update(household, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });
    const [nudge] = await firing.sweepHousehold(household, at(8, 0));
    await expect(firing.acknowledge(other, nudge!.id, at(8, 1))).rejects.toBeInstanceOf(AppError);
  });

  it('refuses to acknowledge a nudge that does not exist', async () => {
    await expect(
      firing.acknowledge(household, '11111111-1111-4111-8111-111111111111', at(8, 0)),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('does not double-fire when two sweeps run at the same instant', async () => {
    await settings.update(household, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });
    const [a, b] = await Promise.all([
      firing.sweepHousehold(household, at(8, 0)),
      firing.sweepHousehold(household, at(8, 0)),
    ]);
    expect([...a, ...b]).toHaveLength(1);
  });

  /**
   * The sibling test above ("does not double-fire") cannot prove the lock: with
   * `.for('update')` deleted it still passes, because two sweeps issued in the
   * same tick rarely interleave their read and their insert. This one is direct
   * — it holds the settings row in another transaction and asserts the sweep
   * *waits*. Remove the lock and the sweep sails past, so the check goes red.
   */
  it('waits for a lock another transaction holds on the settings row', async () => {
    await settings.update(household, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = ctx.client.begin(async (tx) => {
      await tx`select 1 from reminder_settings where household_id = ${household} for update`;
      await held;
    });
    // give the holder time to actually take the lock
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sweep = firing.sweepHousehold(household, at(8, 0));
    const outcome = await Promise.race([
      sweep.then(() => 'swept' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 400)),
    ]);
    expect(outcome).toBe('blocked');

    release();
    await holder;
    expect(await sweep).toHaveLength(1);
  });

  it('rejects an acknowledgement stored before the nudge was fired', async () => {
    await settings.update(household, {
      breakEnabled: false,
      hydrationEnabled: false,
      stretchEnabled: false,
    });
    const [nudge] = await firing.sweepHousehold(household, at(8, 0));
    await expect(
      ctx.db
        .update(reminderOccurrences)
        .set({ acknowledgedAt: at(7, 0) })
        .where(eq(reminderOccurrences.id, nudge!.id)),
    ).rejects.toThrow(/reminder_ack_not_before_fire/);
  });
});
