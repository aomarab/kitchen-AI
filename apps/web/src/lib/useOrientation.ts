'use client';

import { useEffect, useState } from 'react';

export type Orientation = 'landscape' | 'portrait';

const QUERY = '(orientation: landscape)';

function read(): Orientation {
  if (typeof window === 'undefined') return 'landscape';
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(QUERY).matches ? 'landscape' : 'portrait';
  }
  // Fallback for environments without matchMedia: compare the viewport box.
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

/**
 * Reports the current device orientation and re-renders when the user rotates.
 *
 * The initial value is `landscape` — the primary kiosk form and a deterministic
 * server/first-paint default, so the markup React hydrates matches the server
 * and no hydration warning fires; the real orientation is read on mount and the
 * layout flips then if the device is actually held in portrait.
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>('landscape');

  useEffect(() => {
    const update = () => setOrientation(read());
    update();

    const mql = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
    mql?.addEventListener('change', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      mql?.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return orientation;
}
