import type { CookingTimer } from '@kitchen/contracts';

export function timerDurationMinutes(timer: Pick<CookingTimer, 'durationSec'>): number {
  return Math.max(1, Math.round(timer.durationSec / 60));
}

export function timerProgressValue(
  timer: Pick<CookingTimer, 'durationSec' | 'remainingSec' | 'status'>,
): number {
  if (timer.status === 'done') return 1;
  if (timer.durationSec <= 0) return 0;
  const elapsed = 1 - timer.remainingSec / timer.durationSec;
  return Math.min(1, Math.max(0, elapsed));
}
