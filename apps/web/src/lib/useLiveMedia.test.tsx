import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiveMedia } from './useLiveMedia';

/** A stream whose tracks record `stop()` so leaks are observable. */
function fakeStream() {
  const video = { kind: 'video', enabled: true, stop: vi.fn() };
  const audio = { kind: 'audio', enabled: true, stop: vi.fn() };
  const tracks = [video, audio];
  const stream = {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  } as unknown as MediaStream;
  return { stream, video, audio };
}

function stubGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(impl) },
  });
}

afterEach(() => {
  // @ts-expect-error — remove the stub between tests.
  delete navigator.mediaDevices;
  vi.restoreAllMocks();
});

describe('useLiveMedia', () => {
  it('does not touch the camera until start() is called', () => {
    const { stream } = fakeStream();
    stubGetUserMedia(() => Promise.resolve(stream));
    renderHook(() => useLiveMedia());
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('goes ready with a stream on success', async () => {
    const { stream } = fakeStream();
    stubGetUserMedia(() => Promise.resolve(stream));
    const { result } = renderHook(() => useLiveMedia());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('ready');
    expect(result.current.stream).toBe(stream);
  });

  it('maps a refused prompt to denied and a missing device to unavailable', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const denied = renderHook(() => useLiveMedia());
    await act(async () => {
      await denied.result.current.start();
    });
    expect(denied.result.current.state).toBe('denied');

    stubGetUserMedia(() => Promise.reject(new DOMException('none', 'NotFoundError')));
    const missing = renderHook(() => useLiveMedia());
    await act(async () => {
      await missing.result.current.start();
    });
    expect(missing.result.current.state).toBe('unavailable');
  });

  it('reports unavailable when mediaDevices is absent (insecure origin)', async () => {
    // @ts-expect-error — simulate an insecure origin.
    delete navigator.mediaDevices;
    const { result } = renderHook(() => useLiveMedia());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('unavailable');
  });

  it('stops every track on unmount — the webcam light must go out', async () => {
    const { stream, video, audio } = fakeStream();
    stubGetUserMedia(() => Promise.resolve(stream));
    const { result, unmount } = renderHook(() => useLiveMedia());
    await act(async () => {
      await result.current.start();
    });
    expect(video.stop).not.toHaveBeenCalled();

    unmount();

    expect(video.stop).toHaveBeenCalledTimes(1);
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });

  it('mute toggles the real audio track enabled flag', async () => {
    const { stream, audio } = fakeStream();
    stubGetUserMedia(() => Promise.resolve(stream));
    const { result } = renderHook(() => useLiveMedia());
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.toggleMic());
    await waitFor(() => expect(result.current.micMuted).toBe(true));
    expect(audio.enabled).toBe(false);
  });
});
