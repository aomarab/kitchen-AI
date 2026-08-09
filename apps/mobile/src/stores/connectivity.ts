import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';

/**
 * Connectivity signal. NetInfo is the source of truth: a subscription flips the
 * flag as the device's reachability changes. The API client also nudges it (a
 * `NetworkError` marks offline, a successful response marks online) so a failed
 * request is reflected instantly without waiting for the next NetInfo event.
 * `useOfflineSync` watches this to replay the queued inventory events on reconnect.
 */
interface ConnectivityState {
  online: boolean;
  setOnline: (online: boolean) => void;
}

export const useConnectivity = create<ConnectivityState>((set) => ({
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
 * Subscribe to real device connectivity. Mount once (root layout) and call the
 * returned function to unsubscribe. `isInternetReachable`/`isConnected` are
 * treated optimistically: only an explicit `false` marks the app offline, so an
 * unknown (`null`) state during startup does not flash the offline banner.
 */
export function startConnectivityMonitor(): () => void {
  return NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    useConnectivity.getState().setOnline(online);
  });
}
