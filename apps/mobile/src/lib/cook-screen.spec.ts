import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Mobile has no render harness, so the rules that only hold at the screen level
 * are policed by sweeping the source, the same idiom as
 * `apps/mobile/src/lib/reminder-surfaces.spec.ts`.
 */
const source = readFileSync(
  join(__dirname, '..', 'app', 'recipe', '[id]', 'cook.tsx'),
  'utf8',
);

describe('cook mode screen', () => {
  it('has source to police', () => {
    // Anti-vacuity: if the read ever silently returns nothing, every
    // `toContain` below would still pass on an empty string with `.not`.
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain('export default function CookMode');
  });

  it('builds the timer request through the contract-checked planner', () => {
    expect(source).toContain('stepTimerPlan(');
    expect(source).toContain('createTimer.mutate(plan.body)');
    // A hand-rolled request would bypass the label truncation and the
    // MAX_TIMER_DURATION_SEC refusal that `stepTimerPlan` exists to apply.
    expect(source).not.toContain('durationSec:');
  });

  it('reuses an already-running step timer instead of starting a second one', () => {
    expect(source).toContain('existingStepTimer(');
  });

  it('reads remaining time from the projection, not the stored status', () => {
    // A timer that ran out while this screen stayed open is finished, whatever
    // the last-written row says; `projectTimer` is what knows that.
    expect(source).toContain('projectTimer(existing, now)');
  });

  it('keeps the tick gated on a value available before the loading return', () => {
    // Rules of hooks: `useTimerTick` runs above the `recipe.isLoading` early
    // return, so its argument cannot depend on the current step.
    const tickAt = source.indexOf('useTimerTick(');
    const earlyReturnAt = source.indexOf('recipe.isLoading');
    expect(tickAt).toBeGreaterThan(-1);
    expect(earlyReturnAt).toBeGreaterThan(-1);
    expect(tickAt).toBeLessThan(earlyReturnAt);
  });

  it('uses no physical-direction style keys on the inverse surface', () => {
    expect(source).not.toMatch(/\b(marginLeft|marginRight|paddingLeft|paddingRight)\b/);
  });
});
