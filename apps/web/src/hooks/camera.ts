import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

/**
 * Owns the camera `MediaStream` and nothing else — all permission reasoning
 * lives here. `getUserMedia` requires a secure context, so `navigator.
 * mediaDevices` is undefined on plain HTTP (localhost is exempt); that absence
 * maps to `unavailable`, which lands on the file-input fallback like every
 * other acquisition failure.
 */
export function useCamera(): {
  state: CameraState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [state, setState] = useState<CameraState>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setState('ready');
    } catch (error) {
      // Refusal is distinct from absence: one offers a retry, the other only a
      // file input. NotReadable (device busy) and Overconstrained both mean the
      // camera cannot serve us, so they degrade to the fallback too.
      const name = error instanceof DOMException ? error.name : '';
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  }, []);

  // A leaked stream is nearly invisible — the webcam light stays on after the
  // user has moved to another tab or the review screen. Stop on unmount.
  useEffect(() => stop, [stop]);

  return { state, videoRef, start, stop };
}
