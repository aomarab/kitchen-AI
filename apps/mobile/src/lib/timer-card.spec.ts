import { describe, expect, it } from 'vitest';
import type { CookingTimer } from '@kitchen/contracts';
import { timerDurationMinutes, timerProgressValue } from './timer-card';

const timer = (over: Partial<CookingTimer> = {}): CookingTimer => ({
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  label: 'Rice',
  durationSec: 18 * 60,
  remainingSec: 12 * 60 + 40,
  status: 'running',
  endsAt: '2026-09-29T10:20:40.000Z',
  createdAt: '2026-09-29T10:02:40.000Z',
  ...over,
});

describe('timer card projection helpers', () => {
  it('formats the original duration as whole minutes for the caption', () => {
    expect(timerDurationMinutes(timer())).toBe(18);
    expect(timerDurationMinutes(timer({ durationSec: 90 }))).toBe(2);
  });

  it('shows elapsed progress for running timers and clamps the result', () => {
    expect(timerProgressValue(timer())).toBeCloseTo(0.296);
    expect(timerProgressValue(timer({ remainingSec: -20 }))).toBe(1);
    expect(timerProgressValue(timer({ remainingSec: 5000 }))).toBe(0);
  });

  it('fills the progress rail for a ringing timer', () => {
    expect(timerProgressValue(timer({ status: 'done', remainingSec: 0 }))).toBe(1);
  });
});
