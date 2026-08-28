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

/**
 * What the caller wants from the device. `camera` is camera + microphone (the
 * live-vision session); `mic` is microphone only (a voice conversation with no
 * video, e.g. the cook-along assistant), which never turns the webcam light on.
 */
export type LiveMediaKind = 'camera' | 'mic';

export interface UseLiveMedia {
  state: LiveMediaState;
  stream: MediaStream | null;
  /** Which kind the current stream was acquired as, or `null` when idle. */
  kind: LiveMediaKind | null;
  micMuted: boolean;
  start: (kind?: LiveMediaKind) => Promise<void>;
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
  const [kind, setKind] = useState<LiveMediaKind | null>(null);
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

  const start = useCallback(
    async (nextKind: LiveMediaKind = 'camera') => {
      // `navigator.mediaDevices` is undefined on an insecure origin (localhost is
      // exempt), so its absence is "no camera here", not a thrown error.
      const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
      if (!media || typeof media.getUserMedia !== 'function') {
        setState('unavailable');
        return;
      }

      // Stop any stream already held before acquiring the new kind, so
      // switching from camera to mic-only actually releases the webcam.
      stopTracks();
      setState('requesting');
      try {
        const next = await media.getUserMedia({
          // Mic-only requests omit video entirely, so the camera light never
          // comes on for a voice conversation.
          video: nextKind === 'camera' ? { facingMode: 'environment' } : false,
          audio: true,
        });
        streamRef.current = next;
        setStream(next);
        setKind(nextKind);
        setMicMuted(false);
        setState('ready');
      } catch (error) {
        setStream(null);
        setKind(null);
        setState(stateForError(error));
      }
    },
    [stopTracks],
  );

  const stop = useCallback(() => {
    stopTracks();
    setStream(null);
    setKind(null);
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

  return { state, stream, kind, micMuted, start, stop, toggleMic };
}
