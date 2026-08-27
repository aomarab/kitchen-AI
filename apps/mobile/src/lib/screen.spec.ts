import { describe, expect, it } from 'vitest';
import { createTranslator } from '@kitchen/i18n';
import {
  reminderSettingsSchema,
  type CookingTimer,
  type ReminderOccurrence,
  type ReminderSettings,
} from '@kitchen/contracts';
import {
  activeNudge,
  featuredTimer,
  hasAnyNudge,
  hydrationProgressText,
  kioskOrientation,
  needsTick,
  wellnessPlanLines,
} from './screen';

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';

const settings = (over: Partial<ReminderSettings> = {}): ReminderSettings =>
  reminderSettingsSchema.parse({
    householdId: HOUSEHOLD,
    breakEnabled: false,
    stretchEnabled: false,
    morningEnabled: false,
    hydrationEnabled: false,
    ...over,
  });

const nudge = (over: Partial<ReminderOccurrence> = {}): ReminderOccurrence => ({
  id: '22222222-2222-4222-8222-222222222222',
  householdId: HOUSEHOLD,
  type: 'hydration',
  channel: 'screen',
  messageKey: 'reminders.hydration.body',
  firedAt: '2026-08-27T09:00:00.000Z',
  acknowledgedAt: null,
  ...over,
});

const NOW = new Date('2026-08-27T12:00:00.000Z');

const timer = (over: Partial<CookingTimer> = {}): CookingTimer => ({
  id: '33333333-3333-4333-8333-333333333333',
  householdId: HOUSEHOLD,
  label: 'Rice',
  durationSec: 600,
  remainingSec: 300,
  status: 'running',
  endsAt: new Date(NOW.getTime() + 300_000).toISOString(),
  createdAt: '2026-08-27T11:50:00.000Z',
  ...over,
});

const t = createTranslator('en');

describe('kioskOrientation', () => {
  it('reads the window the user is looking at, not the device capability', () => {
    expect(kioskOrientation(874, 402)).toBe('landscape');
    expect(kioskOrientation(402, 874)).toBe('portrait');
  });

  it('is total: a square window still has a layout', () => {
    expect(kioskOrientation(500, 500)).toBe('portrait');
  });
});

describe('wellnessPlanLines', () => {
  it('is empty when nothing is switched on', () => {
    expect(wellnessPlanLines(settings(), t)).toEqual([]);
    expect(hasAnyNudge(settings())).toBe(false);
  });

  it('lists every schedulable nudge in firing order, with each cadence', () => {
    const all = settings({
      morningEnabled: true,
      breakEnabled: true,
      stretchEnabled: true,
      hydrationEnabled: true,
      breakCadenceMinutes: 60,
      stretchCadenceMinutes: 120,
    });
    expect(wellnessPlanLines(all, t)).toEqual([
      'Morning kickstart',
      'Movement breaks · Every 60 min',
      'Stretch reminders · Every 120 min',
      'Hydration reminders',
    ]);
  });

  it('gives stretch its own cadence, not the break one', () => {
    const s = settings({
      stretchEnabled: true,
      breakCadenceMinutes: 30,
      stretchCadenceMinutes: 90,
    });
    expect(wellnessPlanLines(s, t)).toEqual(['Stretch reminders · Every 90 min']);
  });

  it('says the same thing the kitchen screen on the web says', () => {
    // Both surfaces describe one household's plan. They read different i18n
    // namespaces, so only a test stops them drifting into two answers.
    const s = settings({ morningEnabled: true, breakEnabled: true, breakCadenceMinutes: 90 });
    expect(wellnessPlanLines(s, t)).toEqual([
      'Morning kickstart',
      'Movement breaks · Every 90 min',
    ]);
  });
});

describe('activeNudge', () => {
  it('is null when everything has been answered, so the kiosk shows the plan', () => {
    expect(activeNudge([])).toBeNull();
    expect(activeNudge([nudge({ acknowledgedAt: '2026-08-27T09:01:00.000Z' })])).toBeNull();
  });

  it('picks the most recent nudge still owed an answer', () => {
    const older = nudge({ id: 'older', firedAt: '2026-08-27T08:00:00.000Z' });
    const newer = nudge({ id: 'newer', firedAt: '2026-08-27T10:00:00.000Z' });
    expect(activeNudge([older, newer])?.id).toBe('newer');
  });
});

describe('featuredTimer', () => {
  it('is null when there is nothing cooking', () => {
    expect(featuredTimer([], NOW)).toBeNull();
  });

  it('promotes a finished timer over one still running', () => {
    const done = timer({ id: 'done', endsAt: '2026-08-27T11:59:00.000Z', label: 'Eggs' });
    expect(featuredTimer([timer(), done], NOW)?.id).toBe('done');
  });

  it('projects onto now, so the panel never shows the stale stored status', () => {
    // Stored as running with 300s left, but its deadline has passed.
    const lapsed = timer({ endsAt: '2026-08-27T11:59:00.000Z' });
    const featured = featuredTimer([lapsed], NOW);
    expect(featured?.status).toBe('done');
    expect(featured?.remainingSec).toBe(0);
  });

  it('agrees with the timers screen about which timer needs a hand first', () => {
    const soon = timer({ id: 'soon', endsAt: new Date(NOW.getTime() + 60_000).toISOString() });
    const later = timer({ id: 'later', endsAt: new Date(NOW.getTime() + 900_000).toISOString() });
    expect(featuredTimer([later, soon], NOW)?.id).toBe('soon');
  });
});

describe('needsTick', () => {
  it('does not run the clock when nothing is counting down', () => {
    // A kiosk holds the device awake for hours; a tick that never stops keeps
    // the CPU busy for the whole time the food is in the oven.
    expect(needsTick([], NOW)).toBe(false);
    expect(needsTick([timer({ status: 'paused', endsAt: null })], NOW)).toBe(false);
    expect(needsTick([timer({ endsAt: '2026-08-27T11:00:00.000Z' })], NOW)).toBe(false);
  });

  it('runs the clock while a timer still has time left', () => {
    expect(needsTick([timer()], NOW)).toBe(true);
  });
});

describe('hydrationProgressText', () => {
  it('counts acknowledged cups only — a nudge nobody acted on is not a drink', () => {
    const cups = [
      nudge({ id: 'a', acknowledgedAt: '2026-08-27T09:01:00.000Z' }),
      nudge({ id: 'b', acknowledgedAt: null }),
    ];
    expect(hydrationProgressText(cups, settings({ hydrationGoalCups: 8 }), t)).toBe('1 of 8 cups');
  });

  it('ignores nudges of other types', () => {
    const other = nudge({ type: 'break', acknowledgedAt: '2026-08-27T09:01:00.000Z' });
    expect(hydrationProgressText([other], settings({ hydrationGoalCups: 8 }), t)).toBe(
      '0 of 8 cups',
    );
  });
});
