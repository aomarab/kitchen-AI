import { describe, expect, it } from 'vitest';
import {
  breakCadenceMinutesSchema,
  dueReminderTypes,
  hydrationCupsDrunk,
  hydrationIntervalMinutes,
  isQuietHour,
  minutesSinceWaking,
  reminderSettingsSchema,
  reminderTypeSchema,
  updateReminderSettingsRequestSchema,
  wakingWindowMinutes,
  REMINDER_MESSAGE_KEYS,
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
    expect(updateReminderSettingsRequestSchema.safeParse({ quietHoursStart: 24 }).success).toBe(false);
    expect(updateReminderSettingsRequestSchema.safeParse({ quietHoursEnd: -1 }).success).toBe(false);
    expect(updateReminderSettingsRequestSchema.safeParse({ hydrationGoalCups: 0 }).success).toBe(false);
    expect(updateReminderSettingsRequestSchema.safeParse({ hydrationGoalCups: 21 }).success).toBe(false);
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
      morningEnabled: false,
      hydrationEnabled: false,
    });
    expect(dueReminderTypes(off, noneFired, at(12, 0))).toEqual([]);
  });

  it('never fires stretch, because no setting defines its cadence', () => {
    const state: FiredState = { lastFiredAt: {}, countToday: {} };
    for (let hour = 0; hour < 24; hour += 1) {
      expect(dueReminderTypes(settings(), state, at(hour, 0))).not.toContain('stretch');
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
