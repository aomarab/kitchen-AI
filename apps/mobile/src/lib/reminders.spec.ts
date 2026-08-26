import { describe, it, expect } from 'vitest';
import { BREAK_CADENCES, clampHydrationGoal, clampQuietHour, isBreakCadence } from './reminders';

describe('reminder helpers', () => {
  it('offers exactly the four contract cadences in order', () => {
    expect([...BREAK_CADENCES]).toEqual([30, 60, 90, 120]);
  });

  it('clamps the hydration goal into 1..20 and rounds', () => {
    expect(clampHydrationGoal(0)).toBe(1);
    expect(clampHydrationGoal(21)).toBe(20);
    expect(clampHydrationGoal(7.6)).toBe(8);
  });

  it('clamps a quiet hour into 0..23 and rounds', () => {
    expect(clampQuietHour(-1)).toBe(0);
    expect(clampQuietHour(24)).toBe(23);
    expect(clampQuietHour(22.2)).toBe(22);
  });

  it('recognises only the four fixed cadences', () => {
    expect(isBreakCadence(90)).toBe(true);
    expect(isBreakCadence(45)).toBe(false);
  });
});
