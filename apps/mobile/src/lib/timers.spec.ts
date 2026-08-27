import { describe, expect, it } from 'vitest';
import type { CookingTimer } from '@kitchen/contracts';
import { dialFraction, hasRunningTimer, ringTicks, sortTimers } from './timers';

const NOW = new Date('2026-08-27T12:00:00.000Z');

function timer(patch: Partial<CookingTimer> & { id: string }): CookingTimer {
  return {
    householdId: 'h1',
    label: patch.id,
    durationSec: 600,
    status: 'running',
    endsAt: new Date(NOW.getTime() + 300_000).toISOString(),
    remainingSec: 300,
    createdAt: NOW.toISOString(),
    ...patch,
  };
}

describe('sortTimers', () => {
  it('puts what needs a hand first: finished, then soonest, then paused', () => {
    const soon = timer({
      id: 'soon',
      endsAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    const later = timer({
      id: 'later',
      endsAt: new Date(NOW.getTime() + 600_000).toISOString(),
    });
    const paused = timer({ id: 'paused', status: 'paused', endsAt: null, remainingSec: 30 });
    const finished = timer({
      id: 'finished',
      endsAt: new Date(NOW.getTime() - 1_000).toISOString(),
    });

    expect(sortTimers([paused, later, soon, finished], NOW).map((t) => t.id)).toEqual([
      'finished',
      'soon',
      'later',
      'paused',
    ]);
  });

  it('ranks by the projected status, not the one the server last wrote', () => {
    // The row still says `running`; its deadline passed while nobody was looking.
    const expired = timer({
      id: 'expired',
      endsAt: new Date(NOW.getTime() - 5_000).toISOString(),
      remainingSec: 300,
    });
    const [first] = sortTimers([timer({ id: 'live' }), expired], NOW);
    expect(first?.id).toBe('expired');
    expect(first?.status).toBe('done');
    expect(first?.remainingSec).toBe(0);
  });

  it('breaks a tie between paused timers by age, so the list does not shuffle', () => {
    const older = timer({
      id: 'older',
      status: 'paused',
      endsAt: null,
      createdAt: '2026-08-27T09:00:00.000Z',
    });
    const newer = timer({
      id: 'newer',
      status: 'paused',
      endsAt: null,
      createdAt: '2026-08-27T11:00:00.000Z',
    });
    expect(sortTimers([newer, older], NOW).map((t) => t.id)).toEqual(['older', 'newer']);
  });
});

describe('hasRunningTimer', () => {
  it('is false when everything is paused or finished, so the tick can stop', () => {
    const paused = timer({ id: 'p', status: 'paused', endsAt: null });
    const finished = timer({ id: 'f', endsAt: new Date(NOW.getTime() - 1).toISOString() });
    expect(hasRunningTimer([paused, finished], NOW)).toBe(false);
    expect(hasRunningTimer([], NOW)).toBe(false);
    expect(hasRunningTimer([paused, timer({ id: 'r' })], NOW)).toBe(true);
  });
});

describe('dialFraction', () => {
  it('reads as the share of the timer still to run', () => {
    expect(dialFraction(timer({ id: 'a' }), NOW)).toBeCloseTo(0.5);
    expect(dialFraction(timer({ id: 'b', endsAt: null, status: 'paused' }), NOW)).toBeCloseTo(0.5);
  });

  it('clamps rather than going negative once the deadline has passed', () => {
    const over = timer({ id: 'c', endsAt: new Date(NOW.getTime() - 60_000).toISOString() });
    expect(dialFraction(over, NOW)).toBe(0);
  });

  it('is zero for a zero-length timer instead of dividing by zero', () => {
    expect(dialFraction(timer({ id: 'd', durationSec: 0 }), NOW)).toBe(0);
  });
});

describe('ringTicks', () => {
  it('lights the share of the ring that is still to run', () => {
    expect(ringTicks(0.5, 4, 'x')).toEqual(['x', 'x', null, null]);
    expect(ringTicks(1, 3, 'x')).toEqual(['x', 'x', 'x']);
  });

  it('keeps one tick lit while any time remains, so a live timer never reads as finished', () => {
    expect(ringTicks(0.001, 12, 'x').filter(Boolean)).toHaveLength(1);
  });

  it('empties the ring only at exactly zero', () => {
    expect(ringTicks(0, 4, 'x')).toEqual([null, null, null, null]);
  });

  it('never lights more ticks than the ring has', () => {
    expect(ringTicks(2, 3, 'x')).toEqual(['x', 'x', 'x']);
  });
});
