import { describe, expect, it } from 'vitest';
import {
  breakCadenceMinutesSchema,
  dueReminderTypes,
  hydrationCupsDrunk,
  pendingNudge,
  pendingNudges,
  hydrationIntervalMinutes,
  isQuietHour,
  minutesSinceWaking,
  reminderSettingsSchema,
  reminderTypeSchema,
  stretchCadenceMinutesSchema,
  updateReminderSettingsRequestSchema,
  wakingWindowMinutes,
  REMINDER_MESSAGE_KEYS,
  SCHEDULED_REMINDER_TYPES,
  isScheduledReminderType,
  scheduledReminderTypes,
  type FiredState,
  type ReminderOccurrence,
  type ReminderSettings,
} from './reminders.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

describe('reminderSettingsSchema', () => {
  it('fills every setting with a default when only the household id is given', () => {
    const parsed = reminderSettingsSchema.parse({ householdId: HOUSEHOLD_ID });
    expect(parsed).toEqual({
      householdId: HOUSEHOLD_ID,
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

  it('rejects a non-uuid household id', () => {
    expect(reminderSettingsSchema.safeParse({ householdId: 'nope' }).success).toBe(false);
  });
});

describe('breakCadenceMinutesSchema', () => {
  it('accepts only the four supported cadences', () => {
    for (const value of [30, 60, 90, 120]) {
      expect(breakCadenceMinutesSchema.safeParse(value).success).toBe(true);
    }
    for (const value of [0, 45, 100, 120.5, -30]) {
      expect(breakCadenceMinutesSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('stretchCadenceMinutesSchema', () => {
  it('accepts only the four supported cadences', () => {
    for (const value of [30, 60, 90, 120]) {
      expect(stretchCadenceMinutesSchema.safeParse(value).success).toBe(true);
    }
    for (const value of [0, 45, 100, 120.5, -30]) {
      expect(stretchCadenceMinutesSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects a cadence the settings schema would also reject', () => {
    expect(
      reminderSettingsSchema.safeParse({ householdId: HOUSEHOLD_ID, stretchCadenceMinutes: 45 })
        .success,
    ).toBe(false);
  });
});

describe('reminderTypeSchema', () => {
  it('enumerates exactly the four wellness nudge types', () => {
    expect(reminderTypeSchema.options).toEqual(['break', 'stretch', 'morning', 'hydration']);
  });
});

describe('updateReminderSettingsRequestSchema', () => {
  it('is fully optional so a client can patch a single field', () => {
    expect(updateReminderSettingsRequestSchema.parse({})).toEqual({});
    expect(updateReminderSettingsRequestSchema.parse({ breakEnabled: false })).toEqual({
      breakEnabled: false,
    });
  });

  it('does not allow the household id to be patched', () => {
    const parsed = updateReminderSettingsRequestSchema.parse({
      householdId: HOUSEHOLD_ID,
      hydrationGoalCups: 10,
    });
    expect(parsed).toEqual({ hydrationGoalCups: 10 });
  });

  it('rejects an out-of-range quiet hour and an out-of-range hydration goal', () => {
    expect(updateReminderSettingsRequestSchema.safeParse({ quietHoursStart: 24 }).success).toBe(
      false,
    );
    expect(updateReminderSettingsRequestSchema.safeParse({ quietHoursEnd: -1 }).success).toBe(
      false,
    );
    expect(updateReminderSettingsRequestSchema.safeParse({ hydrationGoalCups: 0 }).success).toBe(
      false,
    );
    expect(updateReminderSettingsRequestSchema.safeParse({ hydrationGoalCups: 21 }).success).toBe(
      false,
    );
  });
});

/* ------------------------------------------------------------------ */
/* The scheduling core                                                 */
/* ------------------------------------------------------------------ */

const settings = (over: Partial<ReminderSettings> = {}): ReminderSettings =>
  reminderSettingsSchema.parse({ householdId: HOUSEHOLD_ID, ...over });

/** Build a UTC instant at a given wall-clock hour/minute. */
const at = (hour: number, minute = 0): Date => new Date(Date.UTC(2026, 7, 27, hour, minute, 0));

const noneFired: FiredState = { lastFiredAt: {}, countToday: {} };

describe('isQuietHour', () => {
  it('handles a window that wraps midnight', () => {
    expect(isQuietHour(23, 22, 7)).toBe(true);
    expect(isQuietHour(3, 22, 7)).toBe(true);
    expect(isQuietHour(7, 22, 7)).toBe(false);
    expect(isQuietHour(12, 22, 7)).toBe(false);
  });

  it('handles a same-day window', () => {
    expect(isQuietHour(13, 12, 15)).toBe(true);
    expect(isQuietHour(15, 12, 15)).toBe(false);
  });

  it('treats an empty window as no quiet hours rather than all day', () => {
    for (let hour = 0; hour < 24; hour += 1) expect(isQuietHour(hour, 9, 9)).toBe(false);
  });
});

describe('wakingWindowMinutes', () => {
  it('measures quiet-hours end to quiet-hours start', () => {
    expect(wakingWindowMinutes(settings())).toBe(15 * 60);
    expect(wakingWindowMinutes(settings({ quietHoursEnd: 6, quietHoursStart: 23 }))).toBe(17 * 60);
  });

  it('is a whole day when the quiet window is empty', () => {
    expect(wakingWindowMinutes(settings({ quietHoursStart: 9, quietHoursEnd: 9 }))).toBe(1440);
  });
});

describe('minutesSinceWaking', () => {
  it('counts from the local hour quiet hours end', () => {
    expect(minutesSinceWaking(settings(), at(7, 0))).toBe(0);
    expect(minutesSinceWaking(settings(), at(9, 30))).toBe(150);
  });

  it('reads the wall clock in the household zone, not the server zone', () => {
    // 04:00 UTC is 07:00 in Amman, so an Amman household has just woken.
    const amman = settings({ timeZone: 'Asia/Amman' });
    expect(minutesSinceWaking(amman, at(4, 0))).toBe(0);
    expect(minutesSinceWaking(settings(), at(4, 0))).toBe(21 * 60);
  });
});

describe('hydrationIntervalMinutes', () => {
  it('spreads the goal evenly across the waking window', () => {
    // 15 waking hours split into 9 gaps for 8 cups.
    expect(hydrationIntervalMinutes(settings())).toBe(100);
    expect(hydrationIntervalMinutes(settings({ hydrationGoalCups: 5 }))).toBe(150);
  });

  it('leaves room for the last cup before quiet hours, so the goal is reachable', () => {
    const s = settings();
    const lastCupMinute = hydrationIntervalMinutes(s) * s.hydrationGoalCups;
    expect(lastCupMinute).toBeLessThan(wakingWindowMinutes(s));
  });

  it('never returns a zero interval, however high the goal', () => {
    expect(hydrationIntervalMinutes(settings({ hydrationGoalCups: 20 }))).toBeGreaterThan(0);
  });
});

describe('dueReminderTypes', () => {
  it('fires nothing during quiet hours', () => {
    expect(dueReminderTypes(settings(), noneFired, at(23, 30))).toEqual([]);
    expect(dueReminderTypes(settings(), noneFired, at(3, 0))).toEqual([]);
  });

  it('greets once at the start of the waking day', () => {
    expect(dueReminderTypes(settings(), noneFired, at(7, 5))).toContain('morning');
  });

  it('does not greet twice in the same waking day', () => {
    const state: FiredState = {
      lastFiredAt: { morning: at(7, 0) },
      countToday: { morning: 1 },
    };
    expect(dueReminderTypes(settings(), state, at(11, 0))).not.toContain('morning');
  });

  it('waits one cadence after waking for the first break', () => {
    expect(dueReminderTypes(settings(), noneFired, at(7, 30))).not.toContain('break');
    expect(dueReminderTypes(settings(), noneFired, at(8, 0))).toContain('break');
  });

  it('spaces later breaks by the chosen cadence', () => {
    const state: FiredState = {
      lastFiredAt: { break: at(10, 0) },
      countToday: { break: 1 },
    };
    const half = settings({ breakCadenceMinutes: 30 });
    expect(dueReminderTypes(half, state, at(10, 20))).not.toContain('break');
    expect(dueReminderTypes(half, state, at(10, 30))).toContain('break');
  });

  it('stops nudging hydration once the daily goal has been reached', () => {
    const state: FiredState = {
      lastFiredAt: { hydration: at(8, 0) },
      countToday: { hydration: 8 },
    };
    expect(dueReminderTypes(settings(), state, at(20, 0))).not.toContain('hydration');
  });

  it('honours the per-type toggles', () => {
    const off = settings({
      breakEnabled: false,
      stretchEnabled: false,
      morningEnabled: false,
      hydrationEnabled: false,
    });
    expect(dueReminderTypes(off, noneFired, at(12, 0))).toEqual([]);
  });

  it('waits one stretch cadence after waking for the first stretch', () => {
    const s = settings({ stretchCadenceMinutes: 90 });
    expect(dueReminderTypes(s, noneFired, at(8, 29))).not.toContain('stretch');
    expect(dueReminderTypes(s, noneFired, at(8, 30))).toContain('stretch');
  });

  it('spaces later stretches by the chosen cadence', () => {
    const state: FiredState = {
      lastFiredAt: { stretch: at(10, 0) },
      countToday: { stretch: 1 },
    };
    const s = settings({ stretchCadenceMinutes: 30 });
    expect(dueReminderTypes(s, state, at(10, 20))).not.toContain('stretch');
    expect(dueReminderTypes(s, state, at(10, 30))).toContain('stretch');
  });

  it('runs stretch on its own clock, not the break cadence', () => {
    const s = settings({ breakCadenceMinutes: 30, stretchCadenceMinutes: 120 });
    const state: FiredState = {
      lastFiredAt: { break: at(10, 0), stretch: at(10, 0) },
      countToday: { break: 1, stretch: 1 },
    };
    const due = dueReminderTypes(s, state, at(10, 45));
    expect(due).toContain('break');
    expect(due).not.toContain('stretch');
  });

  it('lets a stretch and a break fall due together rather than dropping one', () => {
    const s = settings({ breakCadenceMinutes: 60, stretchCadenceMinutes: 60 });
    const due = dueReminderTypes(s, noneFired, at(8, 0));
    expect(due).toContain('break');
    expect(due).toContain('stretch');
  });

  it('fires no stretch while its toggle is off, whatever the cadence', () => {
    const s = settings({ stretchEnabled: false, stretchCadenceMinutes: 30 });
    for (let hour = 8; hour < 22; hour += 1) {
      expect(dueReminderTypes(s, noneFired, at(hour, 0))).not.toContain('stretch');
    }
  });
});

describe('hydrationCupsDrunk', () => {
  const cup = (acknowledgedAt: string | null): ReminderOccurrence => ({
    id: '22222222-2222-4222-8222-222222222222',
    householdId: HOUSEHOLD_ID,
    type: 'hydration',
    channel: 'screen',
    messageKey: REMINDER_MESSAGE_KEYS.hydration,
    firedAt: at(9, 0).toISOString(),
    acknowledgedAt,
  });

  it('counts acknowledged cups only — a nudge nobody acted on is not a drink', () => {
    expect(hydrationCupsDrunk([cup('x'), cup(null), cup('y')])).toBe(2);
  });

  it('ignores other reminder types', () => {
    expect(hydrationCupsDrunk([{ ...cup('x'), type: 'break' }])).toBe(0);
  });
});

describe('pendingNudge / pendingNudges', () => {
  const occurrence = (
    id: string,
    hour: number,
    acknowledgedAt: string | null,
    type: ReminderOccurrence['type'] = 'break',
  ): ReminderOccurrence => ({
    id,
    householdId: HOUSEHOLD_ID,
    type,
    channel: 'screen',
    messageKey: REMINDER_MESSAGE_KEYS[type],
    firedAt: at(hour, 0).toISOString(),
    acknowledgedAt,
  });

  it('returns the most recently fired unacknowledged nudge', () => {
    const nudge = pendingNudge([
      occurrence('a', 9, null),
      occurrence('b', 11, null),
      occurrence('c', 10, null),
    ]);
    expect(nudge?.id).toBe('b');
  });

  it('skips acknowledged nudges even when they fired last', () => {
    const nudge = pendingNudge([occurrence('a', 9, null), occurrence('b', 11, 'done')]);
    expect(nudge?.id).toBe('a');
  });

  it('returns null when everything has been dealt with, rather than inventing an alert', () => {
    expect(pendingNudge([occurrence('a', 9, 'done')])).toBeNull();
    expect(pendingNudge([])).toBeNull();
  });

  it('lists every outstanding nudge newest first, so one fired while the app was closed still shows', () => {
    const list = pendingNudges([
      occurrence('a', 9, null, 'hydration'),
      occurrence('b', 11, 'done'),
      occurrence('c', 10, null, 'stretch'),
    ]);
    expect(list.map((o) => o.id)).toEqual(['c', 'a']);
  });

  it('does not mutate the array it is given', () => {
    const input = [occurrence('a', 9, null), occurrence('b', 11, null)];
    pendingNudges(input);
    expect(input.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('agrees with pendingNudge on which nudge is first', () => {
    const input = [occurrence('a', 9, null), occurrence('b', 11, null)];
    expect(pendingNudges(input)[0]?.id).toBe(pendingNudge(input)?.id);
  });
});

describe('SCHEDULED_REMINDER_TYPES', () => {
  const settings = (over: Partial<ReminderSettings> = {}): ReminderSettings =>
    reminderSettingsSchema.parse({ householdId: HOUSEHOLD_ID, ...over });

  /**
   * Every type the engine can produce, discovered by asking it rather than by
   * repeating the list. A sweep of waking hours and fired states, with all
   * toggles on and every counter clear, so any branch that can fire does.
   */
  const typesTheEngineCanProduce = (): Set<string> => {
    const produced = new Set<string>();
    const base = settings({ quietHoursStart: 22, quietHoursEnd: 7, timeZone: 'UTC' });

    // Read off the schema rather than re-typed, so a new cadence option is
    // swept automatically instead of quietly going unchecked.
    const cadences = breakCadenceMinutesSchema.options.map((option) => option.value);

    for (const cadence of cadences) {
      for (const goal of [1, 4, 8, 20]) {
        const s = settings({
          breakCadenceMinutes: cadence,
          stretchCadenceMinutes: cadence,
          hydrationGoalCups: goal,
          quietHoursStart: 22,
          quietHoursEnd: 7,
        });
        // Every whole hour of a day, so no waking window is missed.
        for (let hour = 0; hour < 24; hour += 1) {
          const now = new Date(Date.UTC(2026, 7, 12, hour, 30));
          const empty: FiredState = { lastFiredAt: {}, countToday: {} };
          for (const type of dueReminderTypes(s, empty, now)) produced.add(type);

          // Also with something already fired, which is a different branch.
          const fired: FiredState = {
            lastFiredAt: { break: new Date(now.getTime() - 6 * 60 * 60_000) },
            countToday: { morning: 1, hydration: 0 },
          };
          for (const type of dueReminderTypes(s, fired, now)) produced.add(type);
        }
      }
    }

    expect(base.stretchEnabled).toBe(true);
    return produced;
  };

  it('names exactly the types the firing engine can produce', () => {
    // The point of the list: a client reading it must reach the same answer
    // the engine would. Adding a type here without a branch in the engine
    // fails, and so does deleting a branch without removing it here.
    expect([...typesTheEngineCanProduce()].sort()).toEqual([...SCHEDULED_REMINDER_TYPES].sort());
  });

  it('includes stretch, now that a cadence setting decides when it fires', () => {
    expect(isScheduledReminderType('stretch')).toBe(true);
    expect(reminderTypeSchema.options).toContain('stretch');
  });

  it('keeps stretch in a household plan when its toggle is on', () => {
    expect(scheduledReminderTypes(settings({ stretchEnabled: true }))).toContain('stretch');
  });

  it('reports a stretch-only plan for a household that has only stretch on', () => {
    // The case the kiosk once got wrong in the other direction: it showed a
    // wellness plan that could never produce a single nudge.
    expect(
      scheduledReminderTypes(
        settings({
          stretchEnabled: true,
          breakEnabled: false,
          morningEnabled: false,
          hydrationEnabled: false,
        }),
      ),
    ).toEqual(['stretch']);
  });

  it('honours the other toggles', () => {
    expect(scheduledReminderTypes(settings({ breakEnabled: false }))).toEqual([
      'morning',
      'stretch',
      'hydration',
    ]);
    expect(scheduledReminderTypes(settings())).toEqual([
      'morning',
      'break',
      'stretch',
      'hydration',
    ]);
  });
});
