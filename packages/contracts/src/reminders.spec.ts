import { describe, expect, it } from 'vitest';
import {
  breakCadenceMinutesSchema,
  reminderSettingsSchema,
  reminderTypeSchema,
  updateReminderSettingsRequestSchema,
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
