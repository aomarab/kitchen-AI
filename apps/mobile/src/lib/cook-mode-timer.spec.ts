import { describe, expect, it } from 'vitest';
import type { CookingTimer } from '@kitchen/contracts';
import { cookTimerAfterUpdate, cookTimerControls, cookTimerProgressValue } from './cook-mode-timer';

const timer = (overrides: Partial<CookingTimer> = {}): CookingTimer => ({
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  label: 'Toast the rice',
  durationSec: 120,
  remainingSec: 48,
  status: 'running',
  endsAt: '2026-09-29T10:02:00.000Z',
  createdAt: '2026-09-29T10:00:00.000Z',
  ...overrides,
});

describe('cookTimerControls', () => {
  it('turns a running timer into pause plus stop controls', () => {
    expect(cookTimerControls(timer())).toEqual({
      pauseResumeAction: 'pause',
      pauseResumeIcon: 'pause',
      progressTone: 'active',
      showStop: true,
    });
  });

  it('turns a paused timer into resume plus stop controls with control-coloured progress', () => {
    expect(cookTimerControls(timer({ status: 'paused' }))).toEqual({
      pauseResumeAction: 'resume',
      pauseResumeIcon: 'play',
      progressTone: 'paused',
      showStop: true,
    });
  });

  it('does not expose mutation controls for idle or finished timer states', () => {
    expect(cookTimerControls(null).showStop).toBe(false);
    expect(cookTimerControls(timer({ status: 'done', remainingSec: 0 }))).toEqual({
      pauseResumeAction: null,
      pauseResumeIcon: null,
      progressTone: 'idle',
      showStop: false,
    });
  });
});

describe('cookTimerProgressValue', () => {
  it('fills by elapsed time and clamps server edge cases', () => {
    expect(cookTimerProgressValue(timer())).toBeCloseTo(0.6);
    expect(cookTimerProgressValue(timer({ remainingSec: 500 }))).toBe(0);
    expect(cookTimerProgressValue(timer({ remainingSec: -5 }))).toBe(1);
  });
});

describe('cookTimerAfterUpdate', () => {
  it('keeps the current projected timer when an update fails', () => {
    const current = timer({ status: 'running' });

    expect(cookTimerAfterUpdate(current, { ok: false })).toBe(current);
  });

  it('uses the server timer only after a successful update', () => {
    const current = timer({ status: 'running' });
    const updated = timer({ status: 'paused' });

    expect(cookTimerAfterUpdate(current, { ok: true, timer: updated })).toBe(updated);
  });
});
