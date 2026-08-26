import { describe, expect, it } from 'vitest';
import { normalizeNativeDirection, type DirectionManager } from './direction';

function fakeManager(bootRtl: boolean) {
  const calls: Array<{ allow: boolean; force: boolean }> = [];
  const manager: DirectionManager = {
    // Deliberately frozen, exactly like the real one: writing does not change
    // what a later read reports until the app relaunches.
    isRTL: bootRtl,
    allowRTL: (value) => calls.push({ allow: value, force: value }),
    forceRTL: () => {},
  };
  return { manager, calls };
}

describe('normalizeNativeDirection', () => {
  it('clears a forced-RTL flag left behind by an older build', () => {
    const { manager, calls } = fakeManager(true);
    expect(normalizeNativeDirection(manager)).toBe(true);
    expect(calls).toEqual([{ allow: false, force: false }]);
  });

  it('writes nothing when the native flag is already LTR', () => {
    // The steady state for every install after the first upgraded launch.
    // Writing regardless would dirty native state on every single boot.
    const { manager, calls } = fakeManager(false);
    expect(normalizeNativeDirection(manager)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('does not depend on the locale — Arabic no longer forces the native flag', () => {
    // The whole point of the change: direction is a style, so an Arabic user
    // must still boot with a neutral LTR native base and mirror via `dir`.
    const { manager, calls } = fakeManager(false);
    expect(normalizeNativeDirection(manager)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
