'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Camera + microphone lifecycle for the live assistant, following the web
 * camera-capture design (`2026-07-27-web-camera-capture-design.md`): the same
 * five states, the same `DOMException` → state mapping, and — most importantly —
 * **explicit track cleanup**. A stream left running keeps the webcam light on
 * after the user has moved on, which reads as spyware; that this hook stops
 * every track on `stop()` and on unmount is the behaviour worth a test.
 *
 * The permission prompt is never fired on mount: `start()` is called from a
 * deliberate consent action, because a prompt on load is distrusted by users
 * and penalised by browsers.
 */
export type LiveMediaState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

export interface UseLiveMedia {
  state: LiveMediaState;
  stream: MediaStream | null;
  micMuted: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggleMic: () => void;
}

/** Camera acquisition failures are branches, not errors (spec: error handling). */
function stateForError(error: unknown): LiveMediaState {
  const name = error instanceof DOMException ? error.name : '';
  // A refused prompt is recoverable by the user; everything else means there is
  // no usable device here, so both land somewhere with a working explanation.
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
}

export function useLiveMedia(): UseLiveMedia {
  const [state, setState] = useState<LiveMediaState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  // Mirrors `stream` so unmount cleanup sees the latest without re-subscribing.
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback(() => {
    const current = streamRef.current;
    if (current) {
      for (const track of current.getTracks()) track.stop();
    }
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    // `navigator.mediaDevices` is undefined on an insecure origin (localhost is
    // exempt), so its absence is "no camera here", not a thrown error.
    const media =
      typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media || typeof media.getUserMedia !== 'function') {
      setState('unavailable');
      return;
    }

    setState('requesting');
    try {
      const next = await media.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
      streamRef.current = next;
      setStream(next);
      setMicMuted(false);
      setState('ready');
    } catch (error) {
      setStream(null);
      setState(stateForError(error));
    }
  }, []);

  const stop = useCallback(() => {
    stopTracks();
    setStream(null);
    setMicMuted(false);
    setState('idle');
  }, [stopTracks]);

  const toggleMic = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      const current = streamRef.current;
      if (current) {
        // Muting a real audio track — the control is truthful even offline.
        for (const track of current.getAudioTracks()) track.enabled = !next;
      }
      return next;
    });
  }, []);

  // Stop the webcam when the view unmounts (switching route, ending the call).
  useEffect(() => stopTracks, [stopTracks]);

  return { state, stream, micMuted, start, stop, toggleMic };
}
