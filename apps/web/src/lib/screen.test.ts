import { createTranslator } from '@kitchen/i18n';
import type { ReminderSettings } from '@kitchen/contracts';
import { describe, expect, it } from 'vitest';
import type { ReminderOccurrence } from '@kitchen/contracts';
import { activeNudge, hasAnyNudge, hydrationProgressText, wellnessPlanLines } from './screen';

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
  timeZone: 'UTC',
};

const nudge = (over: Partial<ReminderOccurrence> = {}): ReminderOccurrence => ({
  id: '11111111-1111-4111-8111-111111111111',
  householdId: base.householdId,
  type: 'hydration',
  channel: 'screen',
  messageKey: 'reminders.hydration.body',
  firedAt: '2026-08-27T09:00:00.000Z',
  acknowledgedAt: null,
  ...over,
});

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

  it('keeps the plan in firing order: morning → break → hydration', () => {
    const settings = {
      ...base,
      breakEnabled: true,
      stretchEnabled: true,
      morningEnabled: true,
      hydrationEnabled: true,
    };
    // Stretch is absent even with its toggle on. The firing engine has no
    // cadence for it and never produces one, so listing it here promised the
    // household a nudge that could not arrive.
    expect(wellnessPlanLines(settings, t)).toEqual([
      'Morning kickstart',
      'Movement breaks · Every 90 min',
      'Hydration reminders',
    ]);
  });

  it('shows no plan at all for a household that has only stretch on', () => {
    const settings = { ...base, stretchEnabled: true };
    expect(hasAnyNudge(settings)).toBe(false);
    expect(wellnessPlanLines(settings, t)).toEqual([]);
  });

  it('renders the configured water goal, not a consumed count', () => {
    expect(hydrationProgressText([], { ...base, hydrationGoalCups: 8 }, t)).toBe('0 of 8 cups');
    expect(
      hydrationProgressText(
        [nudge({ acknowledgedAt: '2026-08-27T09:01:00.000Z' })],
        { ...base, hydrationGoalCups: 8 },
        t,
      ),
    ).toBe('1 of 8 cups');
  });
});

describe('hydrationProgressText', () => {
  it('counts acknowledged cups only — a nudge nobody acted on is not a drink', () => {
    const cups = [
      nudge({ id: 'a', acknowledgedAt: '2026-08-27T09:01:00.000Z' }),
      nudge({ id: 'b', acknowledgedAt: null }),
    ];
    expect(hydrationProgressText(cups, base, t)).toBe('1 of 8 cups');
  });

  it('ignores nudges of other types', () => {
    expect(hydrationProgressText([nudge({ type: 'break', acknowledgedAt: 'x' })], base, t)).toBe(
      '0 of 8 cups',
    );
  });
});

describe('activeNudge', () => {
  it('is null when there is nothing to act on, so the screen shows the plan', () => {
    expect(activeNudge([])).toBeNull();
    expect(activeNudge([nudge({ acknowledgedAt: '2026-08-27T09:01:00.000Z' })])).toBeNull();
  });

  it('picks the most recent unacknowledged nudge', () => {
    const older = nudge({ id: 'older', firedAt: '2026-08-27T08:00:00.000Z' });
    const newer = nudge({ id: 'newer', firedAt: '2026-08-27T10:00:00.000Z' });
    const acked = nudge({
      id: 'acked',
      firedAt: '2026-08-27T11:00:00.000Z',
      acknowledgedAt: '2026-08-27T11:01:00.000Z',
    });
    expect(activeNudge([older, newer, acked])?.id).toBe('newer');
  });
});
