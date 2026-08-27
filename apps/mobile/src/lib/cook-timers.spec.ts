import { describe, expect, it } from 'vitest';
import {
  MAX_TIMER_DURATION_SEC,
  MAX_TIMER_LABEL_LENGTH,
  createTimerRequestSchema,
  type CookingTimer,
} from '@kitchen/contracts';
import { existingStepTimer, stepTimerLabel, stepTimerPlan } from './cook-timers';

const timer = (over: Partial<CookingTimer> = {}): CookingTimer => ({
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  label: 'Maqluba · Step 3',
  durationSec: 600,
  remainingSec: 300,
  status: 'running',
  endsAt: '2026-08-27T10:05:00.000Z',
  createdAt: '2026-08-27T10:00:00.000Z',
  ...over,
});

describe('stepTimerLabel', () => {
  it('names the recipe and the step', () => {
    expect(stepTimerLabel('Maqluba', 3, 'Step')).toBe('Maqluba · Step 3');
  });

  it('keeps the step marker when the recipe name is too long', () => {
    // The failure this exists to prevent: `slice(0, 60)` truncates the marker
    // off the end, so every step of a long recipe produces the same label and
    // a notification cannot say which pot is asking for you.
    const long = 'Slow-cooked lamb shoulder with freekeh and caramelised onions';
    const label = stepTimerLabel(long, 7, 'Step');
    expect(label.length).toBeLessThanOrEqual(MAX_TIMER_LABEL_LENGTH);
    expect(label.endsWith('Step 7')).toBe(true);
    expect(label).toContain('…');
  });

  it('gives different steps of a long recipe different labels', () => {
    const long = 'Slow-cooked lamb shoulder with freekeh and caramelised onions';
    expect(stepTimerLabel(long, 7, 'Step')).not.toBe(stepTimerLabel(long, 8, 'Step'));
  });

  it('never exceeds the contract limit, for any step of any name', () => {
    const names = ['', 'A', 'Maqluba', 'x'.repeat(200), 'كبسة لحم مع الأرز البسمتي والمكسرات'];
    for (const name of names) {
      for (const step of [1, 9, 10, 99, 100]) {
        expect(stepTimerLabel(name, step, 'Step').length).toBeLessThanOrEqual(
          MAX_TIMER_LABEL_LENGTH,
        );
      }
    }
  });

  it('drops the name rather than the marker when there is no room at all', () => {
    expect(stepTimerLabel('Maqluba', 3, 'x'.repeat(MAX_TIMER_LABEL_LENGTH))).toHaveLength(
      MAX_TIMER_LABEL_LENGTH,
    );
  });

  it('works in Arabic, where the step word is not Latin', () => {
    expect(stepTimerLabel('مقلوبة', 3, 'خطوة')).toBe('مقلوبة · خطوة 3');
  });
});

describe('stepTimerPlan', () => {
  const plan = (durationMinutes: number | null | undefined) =>
    stepTimerPlan({ recipeTitle: 'Maqluba', stepNumber: 3, stepWord: 'Step', durationMinutes });

  it('turns a timed step into a create request the contract accepts', () => {
    const result = plan(12);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a plan');
    expect(result.body.durationSec).toBe(720);
    // Parsed rather than eyeballed: a body that merely looks right still
    // fails at the server, and the api-client validates against this schema.
    expect(() => createTimerRequestSchema.parse(result.body)).not.toThrow();
  });

  it('refuses an untimed step', () => {
    expect(plan(null)).toEqual({ ok: false, reason: 'no_duration' });
    expect(plan(undefined)).toEqual({ ok: false, reason: 'no_duration' });
  });

  it('refuses a zero or negative duration', () => {
    expect(plan(0)).toEqual({ ok: false, reason: 'no_duration' });
    expect(plan(-5)).toEqual({ ok: false, reason: 'no_duration' });
  });

  it('refuses a step longer than the contract allows', () => {
    // A twelve-hour cap, so an overnight prove or a long brine is refused
    // here rather than by the server after the button was pressed.
    const overMinutes = MAX_TIMER_DURATION_SEC / 60 + 1;
    expect(plan(overMinutes)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('accepts a step exactly at the cap', () => {
    expect(plan(MAX_TIMER_DURATION_SEC / 60).ok).toBe(true);
  });

  it('rounds to whole seconds, because the contract wants an integer', () => {
    const result = plan(1.5);
    if (!result.ok) throw new Error('expected a plan');
    expect(result.body.durationSec).toBe(90);
    expect(Number.isInteger(result.body.durationSec)).toBe(true);
  });

  it('rounds a duration that is not a whole number of seconds', () => {
    const result = plan(0.51);
    if (!result.ok) throw new Error('expected a plan');
    expect(Number.isInteger(result.body.durationSec)).toBe(true);
    expect(() => createTimerRequestSchema.parse(result.body)).not.toThrow();
  });

  it('refuses a duration that is not a number at all', () => {
    expect(plan(Number.NaN)).toEqual({ ok: false, reason: 'no_duration' });
    expect(plan(Number.POSITIVE_INFINITY)).toEqual({ ok: false, reason: 'no_duration' });
  });
});

describe('existingStepTimer', () => {
  const label = 'Maqluba · Step 3';

  it('finds a running timer for the same step', () => {
    expect(existingStepTimer([timer()], label)?.id).toBe(timer().id);
  });

  it('finds a paused timer for the same step', () => {
    // Paused still counts: starting a second one would leave two timers for
    // one pot, and resuming the first is what the cook actually wants.
    expect(existingStepTimer([timer({ status: 'paused', endsAt: null })], label)).not.toBeNull();
  });

  it('ignores a finished timer, so a second batch can be started', () => {
    expect(existingStepTimer([timer({ status: 'done' })], label)).toBeNull();
  });

  it('ignores a timer for a different step', () => {
    expect(existingStepTimer([timer({ label: 'Maqluba · Step 4' })], label)).toBeNull();
  });

  it('returns null when there are no timers at all', () => {
    expect(existingStepTimer([], label)).toBeNull();
  });
});
