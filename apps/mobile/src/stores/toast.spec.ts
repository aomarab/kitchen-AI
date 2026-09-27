import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    announceForAccessibility: vi.fn(),
  },
}));

describe('useToastStore', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { useToastStore } = await import('./toast');
    useToastStore.getState().dismiss();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('announces and auto-dismisses the toast after TOAST_MS', async () => {
    const { AccessibilityInfo } = await import('react-native');
    const { TOAST_MS, useToastStore } = await import('./toast');

    useToastStore.getState().show({ message: 'Added 3 to your kitchen' });

    expect(useToastStore.getState().toast?.message).toBe('Added 3 to your kitchen');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Added 3 to your kitchen',
    );

    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(useToastStore.getState().toast).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('reschedules auto-dismiss when a newer toast replaces the current one', async () => {
    const { TOAST_MS, useToastStore } = await import('./toast');

    useToastStore.getState().show({ message: 'First' });
    vi.advanceTimersByTime(TOAST_MS - 1000);

    useToastStore.getState().show({ message: 'Second' });
    vi.advanceTimersByTime(999);
    expect(useToastStore.getState().toast?.message).toBe('Second');

    vi.advanceTimersByTime(TOAST_MS - 999);
    expect(useToastStore.getState().toast).toBeNull();
  });
});
