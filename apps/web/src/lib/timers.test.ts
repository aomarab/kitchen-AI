import { describe, expect, it } from 'vitest';
import type { CookingTimer } from '@kitchen/contracts';
import { dialFraction, featuredTimer, hasRunningTimer } from './timers';

const NOW = new Date('2026-08-27T10:00:00.000Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString();

function timer(overrides: Partial<CookingTimer> = {}): CookingTimer {
  return {
    id: 't1',
    householdId: 'h1',
    label: 'Rice',
    durationSec: 600,
    status: 'running',
    endsAt: at(300),
    remainingSec: 300,
    createdAt: at(-300),
    ...overrides,
  };
}

describe('hasRunningTimer', () => {
  it('is false for an empty kitchen, so nothing schedules a tick', () => {
    expect(hasRunningTimer([], NOW)).toBe(false);
  });

  it('is false when every timer is paused or already finished', () => {
    expect(
      hasRunningTimer(
        [
          timer({ id: 'a', status: 'paused', endsAt: null }),
          timer({ id: 'b', status: 'done', endsAt: null, remainingSec: 0 }),
        ],
        NOW,
      ),
    ).toBe(false);
  });

  it('is false when the only running timer has already lapsed', () => {
    expect(hasRunningTimer([timer({ endsAt: at(-1) })], NOW)).toBe(false);
  });

  it('is true while one timer is still counting down', () => {
    expect(hasRunningTimer([timer({ status: 'paused', endsAt: null }), timer({ id: 'b' })], NOW)).toBe(
      true,
    );
  });
});

describe('featuredTimer', () => {
  it('has nothing to show for an empty list', () => {
    expect(featuredTimer([], NOW)).toBeNull();
  });

  it('prefers a finished timer, because that is the one asking for attention', () => {
    const chosen = featuredTimer(
      [timer({ id: 'running', endsAt: at(30) }), timer({ id: 'lapsed', label: 'Tea', endsAt: at(-5) })],
      NOW,
    );
    expect(chosen).toMatchObject({ id: 'lapsed', status: 'done', remainingSec: 0 });
  });

  it('otherwise picks the timer closest to finishing', () => {
    const chosen = featuredTimer(
      [
        timer({ id: 'far', label: 'Chicken', endsAt: at(1800) }),
        timer({ id: 'near', label: 'Tea', endsAt: at(90) }),
      ],
      NOW,
    );
    expect(chosen).toMatchObject({ id: 'near', remainingSec: 90 });
  });

  it('falls back to a paused timer only when nothing else exists', () => {
    const chosen = featuredTimer([timer({ id: 'p', status: 'paused', endsAt: null })], NOW);
    expect(chosen).toMatchObject({ id: 'p', status: 'paused' });
  });
});

describe('dialFraction', () => {
  it('is the share of the timer still to run', () => {
    expect(dialFraction(timer(), NOW)).toBe(0.5);
  });

  it('is zero once the deadline has passed, never negative', () => {
    expect(dialFraction(timer({ endsAt: at(-600) }), NOW)).toBe(0);
  });

  it('never exceeds one, even if a paused snapshot exceeds the duration', () => {
    expect(
      dialFraction(timer({ status: 'paused', endsAt: null, remainingSec: 9999 }), NOW),
    ).toBe(1);
  });
});
