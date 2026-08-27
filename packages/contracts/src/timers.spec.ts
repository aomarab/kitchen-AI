import { describe, expect, it } from 'vitest';
import {
  cookingTimerSchema,
  createTimerRequestSchema,
  formatRemaining,
  projectTimer,
  remainingSecAt,
  updateTimerRequestSchema,
  DEFAULT_EXTEND_SEC,
  MAX_TIMER_DURATION_SEC,
  type CookingTimer,
} from './timers.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';
const TIMER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-27T10:00:00.000Z');

function timer(overrides: Partial<CookingTimer> = {}): CookingTimer {
  return {
    id: TIMER_ID,
    householdId: HOUSEHOLD_ID,
    label: 'Rice',
    durationSec: 600,
    status: 'running',
    endsAt: '2026-08-27T10:05:00.000Z',
    remainingSec: 300,
    createdAt: '2026-08-27T09:55:00.000Z',
    ...overrides,
  };
}

describe('cookingTimerSchema', () => {
  it('accepts a running timer with a deadline and a paused timer without one', () => {
    expect(cookingTimerSchema.safeParse(timer()).success).toBe(true);
    expect(
      cookingTimerSchema.safeParse(timer({ status: 'paused', endsAt: null, remainingSec: 300 }))
        .success,
    ).toBe(true);
  });

  it('rejects a running timer with no deadline, which would count down from a stale snapshot', () => {
    expect(cookingTimerSchema.safeParse(timer({ endsAt: null })).success).toBe(false);
  });

  it('rejects a paused or done timer that still carries a deadline', () => {
    expect(cookingTimerSchema.safeParse(timer({ status: 'paused' })).success).toBe(false);
    expect(cookingTimerSchema.safeParse(timer({ status: 'done', remainingSec: 0 })).success).toBe(
      false,
    );
  });

  it('rejects a done timer that claims time is left', () => {
    expect(
      cookingTimerSchema.safeParse(timer({ status: 'done', endsAt: null, remainingSec: 5 })).success,
    ).toBe(false);
  });
});

describe('createTimerRequestSchema', () => {
  it('trims the label and requires a non-empty one', () => {
    expect(createTimerRequestSchema.parse({ label: '  Rice  ', durationSec: 600 }).label).toBe(
      'Rice',
    );
    expect(createTimerRequestSchema.safeParse({ label: '   ', durationSec: 600 }).success).toBe(
      false,
    );
  });

  it('rejects a zero, fractional or absurdly long duration', () => {
    expect(createTimerRequestSchema.safeParse({ label: 'Rice', durationSec: 0 }).success).toBe(
      false,
    );
    expect(createTimerRequestSchema.safeParse({ label: 'Rice', durationSec: 1.5 }).success).toBe(
      false,
    );
    expect(
      createTimerRequestSchema.safeParse({ label: 'Rice', durationSec: MAX_TIMER_DURATION_SEC + 1 })
        .success,
    ).toBe(false);
  });
});

describe('updateTimerRequestSchema', () => {
  it('defaults an extend with no amount to one minute', () => {
    expect(updateTimerRequestSchema.parse({ action: 'extend' })).toEqual({
      action: 'extend',
      seconds: DEFAULT_EXTEND_SEC,
    });
  });

  it('accepts the three state transitions and rejects anything else', () => {
    for (const action of ['pause', 'resume', 'stop']) {
      expect(updateTimerRequestSchema.safeParse({ action }).success).toBe(true);
    }
    expect(updateTimerRequestSchema.safeParse({ action: 'restart' }).success).toBe(false);
  });

  it('refuses a direct write to timer state, which could reach an unreachable status', () => {
    expect(
      updateTimerRequestSchema.safeParse({ status: 'running', endsAt: null }).success,
    ).toBe(false);
  });
});

describe('remainingSecAt', () => {
  it('derives a running timer from its deadline, not from the stored snapshot', () => {
    expect(remainingSecAt(timer({ remainingSec: 999 }), NOW)).toBe(300);
  });

  it('rounds up so the last second is displayed for its full duration', () => {
    const almost = timer({ endsAt: '2026-08-27T10:00:00.400Z' });
    expect(remainingSecAt(almost, NOW)).toBe(1);
  });

  it('never goes negative once the deadline has passed', () => {
    expect(remainingSecAt(timer({ endsAt: '2026-08-27T09:00:00.000Z' }), NOW)).toBe(0);
  });

  it('trusts the stored value for a paused timer, whose clock is not running', () => {
    expect(remainingSecAt(timer({ status: 'paused', endsAt: null, remainingSec: 42 }), NOW)).toBe(
      42,
    );
  });
});

describe('projectTimer', () => {
  it('reports an elapsed running timer as done, because nothing sweeps the table', () => {
    const expired = projectTimer(timer({ endsAt: '2026-08-27T09:59:59.000Z' }), NOW);
    expect(expired.status).toBe('done');
    expect(expired.endsAt).toBeNull();
    expect(expired.remainingSec).toBe(0);
    expect(cookingTimerSchema.safeParse(expired).success).toBe(true);
  });

  it('refreshes the snapshot of a still-running timer without changing its status', () => {
    const live = projectTimer(timer({ remainingSec: 999 }), NOW);
    expect(live.status).toBe('running');
    expect(live.remainingSec).toBe(300);
  });

  it('leaves a paused timer entirely alone', () => {
    const paused = timer({ status: 'paused', endsAt: null, remainingSec: 42 });
    expect(projectTimer(paused, NOW)).toEqual(paused);
  });
});

describe('formatRemaining', () => {
  it('pads seconds and drops the hour segment below an hour', () => {
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(5)).toBe('0:05');
    expect(formatRemaining(65)).toBe('1:05');
    expect(formatRemaining(600)).toBe('10:00');
  });

  it('adds an hour segment at and above an hour', () => {
    expect(formatRemaining(3600)).toBe('1:00:00');
    expect(formatRemaining(3661)).toBe('1:01:01');
  });

  it('clamps a negative value rather than rendering a minus sign', () => {
    expect(formatRemaining(-30)).toBe('0:00');
  });
});
