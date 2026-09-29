import type { CookingTimer, UpdateTimerRequest } from '@kitchen/contracts';
import type { IconName } from '../components';
import type { ProgressToneName } from '../components/status-tones';
import { timerProgressValue } from './timer-card';

type PauseResumeAction = Extract<UpdateTimerRequest['action'], 'pause' | 'resume'>;

export interface CookTimerControls {
  pauseResumeAction: PauseResumeAction | null;
  pauseResumeIcon: IconName | null;
  progressTone: ProgressToneName;
  showStop: boolean;
}

export function cookTimerControls(timer: Pick<CookingTimer, 'status'> | null): CookTimerControls {
  if (!timer || timer.status === 'done') {
    return {
      pauseResumeAction: null,
      pauseResumeIcon: null,
      progressTone: 'idle',
      showStop: false,
    };
  }

  const paused = timer.status === 'paused';
  return {
    pauseResumeAction: paused ? 'resume' : 'pause',
    pauseResumeIcon: paused ? 'play' : 'pause',
    progressTone: paused ? 'paused' : 'active',
    showStop: true,
  };
}

export function cookTimerProgressValue(
  timer: Pick<CookingTimer, 'durationSec' | 'remainingSec' | 'status'> | null,
): number {
  return timer ? timerProgressValue(timer) : 0;
}

export function cookTimerAfterUpdate<T>(
  current: T,
  result: { ok: true; timer: T } | { ok: false },
): T {
  return result.ok ? result.timer : current;
}
