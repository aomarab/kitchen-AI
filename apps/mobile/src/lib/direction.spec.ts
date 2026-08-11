import { describe, expect, it } from 'vitest';
import { createDirectionApplier, type DirectionManager } from './direction';

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

describe('createDirectionApplier', () => {
  it('does nothing when the locale already matches the launch direction', () => {
    const { manager, calls } = fakeManager(true);
    expect(createDirectionApplier(manager)('ar')).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('forces the flag when the locale disagrees with the launch direction', () => {
    const { manager, calls } = fakeManager(false);
    expect(createDirectionApplier(manager)('ar')).toBe(true);
    expect(calls).toEqual([{ allow: true, force: true }]);
  });

  it('re-applies when the user switches away and back in one session', () => {
    // Boot RTL (Arabic). Switch to English, change your mind, switch back.
    const { manager, calls } = fakeManager(true);
    const apply = createDirectionApplier(manager);

    expect(apply('en')).toBe(true);
    // Reading the stale `isRTL` here would report `true`, match `ar`, and skip
    // the write — leaving the app LTR with Arabic text on the next launch.
    expect(apply('ar')).toBe(true);

    expect(calls).toEqual([
      { allow: false, force: false },
      { allow: true, force: true },
    ]);
  });

  it('stays quiet when the locale is set to the value already written', () => {
    const { manager, calls } = fakeManager(true);
    const apply = createDirectionApplier(manager);

    expect(apply('en')).toBe(true);
    expect(apply('en')).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('ignores a pre-hydration locale that matches the launch direction', () => {
    const { manager, calls } = fakeManager(false);
    const apply = createDirectionApplier(manager);

    expect(apply('en')).toBe(false);
    expect(apply('ar')).toBe(true);
    expect(calls).toEqual([{ allow: true, force: true }]);
  });
});
