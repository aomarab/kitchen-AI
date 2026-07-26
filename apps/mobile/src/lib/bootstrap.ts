import { useEffect, useState } from 'react';
import { useLocaleStore } from './locale';
import { useSettingsStore } from '../stores/settings';
import { useOfflineQueue } from '../stores/offline-queue';
import { useAuthStore } from '../stores/auth';

/**
 * Hydrates every persisted store (locale, display prefs, the offline event
 * queue and the session) before the app renders its first screen. Returns
 * `true` once hydration finishes so the root layout can gate on it.
 */
export function useBootstrap(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      useLocaleStore.getState().hydrate(),
      useSettingsStore.getState().hydrate(),
      useOfflineQueue.getState().hydrate(),
      useAuthStore.getState().hydrate(),
    ]).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
}
