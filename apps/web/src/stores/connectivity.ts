import { create } from 'zustand';

/**
 * Connectivity signal for the web app (kitchen companion spec — Feature 1, the
 * kiosk status bar).
 *
 * There are two sources and they answer different questions:
 *
 * - The browser's `online`/`offline` events say whether the machine believes it
 *   has a network interface. That is the only signal available before the first
 *   request, but `navigator.onLine === true` is famously weak — a captive portal
 *   or a hotel wifi with no route out still reports online.
 * - A failed request says the API was genuinely unreachable, which is the thing
 *   the kiosk actually cares about. `trackedFetch` in `lib/api.ts` reports it.
 *
 * So the two are not symmetric. A failed request may flip the app offline even
 * while `navigator.onLine` insists otherwise, and only a *successful* response
 * or an explicit `online` event clears it. This mirrors
 * `apps/mobile/src/stores/connectivity.ts`, which does the same with NetInfo.
 */
interface ConnectivityState {
  online: boolean;
  setOnline: (online: boolean) => void;
}

export const useConnectivity = create<ConnectivityState>((set) => ({
  // Optimistic: a kiosk that flashes "offline" for one frame on every load
  // trains people to ignore the indicator.
  online: true,
  setOnline: (online) => set((prev) => (prev.online === online ? prev : { online })),
}));

export function markOnline(): void {
  useConnectivity.getState().setOnline(true);
}

export function markOffline(): void {
  useConnectivity.getState().setOnline(false);
}

/**
 * Subscribe to the browser's connectivity events. Mount once (the app-wide
 * providers) and call the returned function to unsubscribe. Inert during server
 * rendering, so the first paint always claims online and hydration cannot
 * mismatch.
 */
export function startConnectivityMonitor(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Only the negative initial read is acted on. `navigator.onLine === true`
  // would be no evidence at all, and asserting it here could clear an offline
  // state a failed request had established.
  if (window.navigator.onLine === false) markOffline();

  window.addEventListener('online', markOnline);
  window.addEventListener('offline', markOffline);
  return () => {
    window.removeEventListener('online', markOnline);
    window.removeEventListener('offline', markOffline);
  };
}
