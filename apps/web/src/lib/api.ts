import { createApiClient, type TokenStore } from '@kitchen/api-client';
import type { TokenPair } from '@kitchen/contracts';
import { API_URL } from './config';
import { useSession } from '../stores/session';

const TOKEN_KEY = 'kitchen_tokens';

/**
 * Persists the token pair in localStorage so a reload keeps the session. Guards
 * every access with a `window` check so it is inert during server rendering.
 */
function createBrowserTokenStore(): TokenStore {
  return {
    get() {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as TokenPair;
      } catch {
        return null;
      }
    },
    set(tokens) {
      if (typeof window === 'undefined') return;
      if (tokens) window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
      else window.localStorage.removeItem(TOKEN_KEY);
    },
  };
}

const browserTokenStore = createBrowserTokenStore();

/**
 * Wipes the persisted token pair from localStorage. Account deletion must call
 * this: clearing the in-memory session store leaves `kitchen_tokens` behind,
 * so a deleted account's credentials would otherwise survive in browser
 * storage. Inert during server rendering — the store's own `window` guard
 * makes it SSR-safe.
 */
export function clearStoredTokens(): void {
  browserTokenStore.set(null);
}

/**
 * Single typed client for the whole app. Points at `API_URL`, which the MSW
 * layer serves in dev and tests. Household-scoped routes read the acting
 * household from the session store; swapping mocks for the real API needs no
 * change here.
 */
export const api = createApiClient({
  baseUrl: API_URL,
  tokenStore: browserTokenStore,
  getHouseholdId: () => useSession.getState().householdId,
  onAuthExpired: () => useSession.getState().clear(),
});
