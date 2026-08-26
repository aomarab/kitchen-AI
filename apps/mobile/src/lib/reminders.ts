import type { BreakCadenceMinutes } from '@kitchen/contracts';

export const BREAK_CADENCES: readonly BreakCadenceMinutes[] = [30, 60, 90, 120] as const;

export const HYDRATION_MIN = 1;
export const HYDRATION_MAX = 20;
export const QUIET_MIN = 0;
export const QUIET_MAX = 23;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n)));

export function clampHydrationGoal(n: number): number {
  return clamp(n, HYDRATION_MIN, HYDRATION_MAX);
}

export function clampQuietHour(n: number): number {
  return clamp(n, QUIET_MIN, QUIET_MAX);
}

export function isBreakCadence(n: number): n is BreakCadenceMinutes {
  return (BREAK_CADENCES as readonly number[]).includes(n);
}
