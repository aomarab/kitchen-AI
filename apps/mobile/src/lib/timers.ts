import { useEffect, useState } from 'react';
import { projectTimer, remainingSecAt, type CookingTimer } from '@kitchen/contracts';

/**
 * A clock that ticks once a second, but only while something is counting down.
 *
 * Timers live on the server and are rendered from `endsAt`, so the only reason
 * to re-render is that a second passed. Keeping the interval off when every
 * timer is paused, finished or absent matters more on a phone than anywhere
 * else: a screen left open on the counter would otherwise re-render — and keep
 * the CPU awake — for the whole time the food is in the oven.
 */
export function useTimerTick(active: boolean): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** True when at least one timer still has a deadline in the future. */
export function hasRunningTimer(timers: readonly CookingTimer[], now: Date): boolean {
  return timers.some((timer) => projectTimer(timer, now).status === 'running');
}

const ATTENTION_ORDER: Record<CookingTimer['status'], number> = {
  done: 0,
  running: 1,
  paused: 2,
};

/**
 * The order the list is read in: whatever needs a hand first, at the top.
 *
 * Finished timers lead because they are the ones asking for something; then
 * running timers by how soon they finish; paused last, since a paused timer
 * will not change on its own. The list is short enough that scrolling to find
 * the pot that is about to boil over would be the only real failure here.
 *
 * Returns *projected* timers, so callers read a status that accounts for the
 * deadline having passed rather than the stale one the server last wrote.
 */
export function sortTimers(timers: readonly CookingTimer[], now: Date): CookingTimer[] {
  return timers
    .map((timer) => projectTimer(timer, now))
    .sort((a, b) => {
      const byStatus = ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      if (a.status === 'paused') return a.createdAt.localeCompare(b.createdAt);
      return a.remainingSec - b.remainingSec;
    });
}

/** Fraction of the timer still to run, 0..1. */
export function dialFraction(timer: CookingTimer, now: Date): number {
  if (timer.durationSec <= 0) return 0;
  const remaining = remainingSecAt(timer, now);
  return Math.min(1, Math.max(0, remaining / timer.durationSec));
}

/**
 * The dial, as the segments `Ring` paints.
 *
 * `Ring` takes one entry per tick — a colour, or `null` for a blank one — so
 * the countdown is expressed by how many ticks are still lit. Rounding is *up*
 * so that a timer with any time left keeps at least one lit tick: rounding to
 * nearest would empty the ring during the final seconds, which reads as
 * "finished" while the food is still cooking.
 */
export function ringTicks(
  fraction: number,
  count: number,
  filled: string,
  empty: string | null = null,
): (string | null)[] {
  const lit = Math.min(count, Math.max(0, Math.ceil(fraction * count)));
  return Array.from({ length: count }, (_, index) => (index < lit ? filled : empty));
}
