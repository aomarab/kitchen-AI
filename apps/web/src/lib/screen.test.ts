import { createTranslator } from '@kitchen/i18n';
import type { ReminderSettings } from '@kitchen/contracts';
import { describe, expect, it } from 'vitest';
import { hasAnyNudge, hydrationGoalText, wellnessPlanLines } from './screen';

const base: ReminderSettings = {
  householdId: '00000000-0000-0000-0000-000000000000',
  breakEnabled: false,
  stretchEnabled: false,
  morningEnabled: false,
  hydrationEnabled: false,
  breakCadenceMinutes: 90,
  hydrationGoalCups: 8,
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

const t = createTranslator('en');

describe('screen helpers', () => {
  it('reports no nudge when every toggle is off', () => {
    expect(hasAnyNudge(base)).toBe(false);
    expect(wellnessPlanLines(base, t)).toEqual([]);
  });

  it('lists a line per enabled nudge, with cadence on the break line', () => {
    const settings = { ...base, breakEnabled: true, hydrationEnabled: true, breakCadenceMinutes: 60 as const };
    expect(hasAnyNudge(settings)).toBe(true);
    const lines = wellnessPlanLines(settings, t);
    expect(lines).toEqual(['Movement breaks · Every 60 min', 'Hydration reminders']);
  });

  it('keeps the plan order break → stretch → morning → hydration', () => {
    const settings = {
      ...base,
      breakEnabled: true,
      stretchEnabled: true,
      morningEnabled: true,
      hydrationEnabled: true,
    };
    expect(wellnessPlanLines(settings, t)).toEqual([
      'Movement breaks · Every 90 min',
      'Stretch reminders',
      'Morning kickstart',
      'Hydration reminders',
    ]);
  });

  it('renders the configured water goal, not a consumed count', () => {
    expect(hydrationGoalText({ ...base, hydrationGoalCups: 8 }, t)).toBe('8 cups');
    expect(hydrationGoalText({ ...base, hydrationGoalCups: 1 }, t)).toBe('1 cup');
  });
});
