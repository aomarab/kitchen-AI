'use client';

import { useEffect, useState } from 'react';
import { projectTimer, remainingSecAt, type CookingTimer } from '@kitchen/contracts';

/**
 * A clock that ticks once a second, but only while something is counting down.
 *
 * Timers are persisted server-side and rendered from `endsAt`, so the only
 * reason to re-render is that a second passed. Keeping the interval off when
 * every timer is paused, finished or absent means an idle kitchen screen — the
 * surface most likely to be left on for hours — is not re-rendering forever.
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
export function hasRunningTimer(timers: CookingTimer[], now: Date): boolean {
  return timers.some((timer) => projectTimer(timer, now).status === 'running');
}

/**
 * The one timer a single-line surface (the kitchen screen card) should show.
 *
 * A finished timer wins, because it is the one asking for attention; otherwise
 * the timer closest to finishing. A paused timer is chosen only when nothing
 * else exists — it is not going to change on its own.
 */
export function featuredTimer(timers: CookingTimer[], now: Date): CookingTimer | null {
  const projected = timers.map((timer) => projectTimer(timer, now));
  const done = projected.filter((timer) => timer.status === 'done');
  if (done.length > 0) return done[done.length - 1]!;

  const running = projected
    .filter((timer) => timer.status === 'running')
    .sort((a, b) => a.remainingSec - b.remainingSec);
  if (running.length > 0) return running[0]!;

  return projected.find((timer) => timer.status === 'paused') ?? null;
}

/** Fraction of the timer still to run, 0..1, for the dial. */
export function dialFraction(timer: CookingTimer, now: Date): number {
  if (timer.durationSec <= 0) return 0;
  const remaining = remainingSecAt(timer, now);
  return Math.min(1, Math.max(0, remaining / timer.durationSec));
}
