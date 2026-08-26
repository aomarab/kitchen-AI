import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOrientation } from './useOrientation';

/** A controllable `matchMedia` singleton so a test can simulate a rotation. */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  let matches = initial;
  const mql = {
    get matches() {
      return matches;
    },
    media: '(orientation: landscape)',
    addEventListener: (_type: string, l: (e: { matches: boolean }) => void) => listeners.add(l),
    removeEventListener: (_type: string, l: (e: { matches: boolean }) => void) => listeners.delete(l),
    dispatchEvent: () => true,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return {
    rotateTo(next: boolean) {
      matches = next;
      listeners.forEach((l) => l({ matches }));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useOrientation', () => {
  it('reports the current orientation on mount', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useOrientation());
    expect(result.current).toBe('portrait');
  });

  it('flips when the device is rotated', () => {
    const screen = installMatchMedia(false);
    const { result } = renderHook(() => useOrientation());
    expect(result.current).toBe('portrait');

    act(() => screen.rotateTo(true));
    expect(result.current).toBe('landscape');

    act(() => screen.rotateTo(false));
    expect(result.current).toBe('portrait');
  });
});
