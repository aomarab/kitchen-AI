import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCamera } from './camera';

function stubMediaDevices(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
}

afterEach(() => {
  // @ts-expect-error - remove the stub between tests
  delete navigator.mediaDevices;
});

function trackedStream(track: { stop: () => void }): MediaStream {
  return { getTracks: () => [track] } as unknown as MediaStream;
}

describe('useCamera', () => {
  it('maps a refused permission to denied', async () => {
    stubMediaDevices(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('denied');
  });

  it('maps a missing camera to unavailable', async () => {
    stubMediaDevices(() => Promise.reject(new DOMException('no', 'NotFoundError')));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('unavailable');
  });

  it('reports unavailable when mediaDevices is absent', async () => {
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('unavailable');
  });

  it('stops every track on stop', async () => {
    const stop = vi.fn();
    stubMediaDevices(() => Promise.resolve(trackedStream({ stop })));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('ready');
    act(() => result.current.stop());
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
