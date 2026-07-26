import { create } from 'zustand';

/**
 * Connectivity signal. The app has no NetInfo dependency, so online/offline is
 * inferred from the API client: a `NetworkError` flips it offline, a successful
 * response flips it back online. `useOfflineSync` watches this to replay the
 * queued inventory events on reconnect.
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
