import * as SecureStore from 'expo-secure-store';
import { tokenPairSchema, type TokenPair } from '@kitchen/contracts';
import type { TokenStore } from '@kitchen/api-client';

const KEY = 'kitchen_tokens';

export interface HydratableTokenStore extends TokenStore {
  /** Loads tokens from the keychain into memory. Safe to call repeatedly. */
  hydrate: () => Promise<TokenPair | null>;
}

/**
 * Persistent token store backed by `expo-secure-store` (the OS keychain), as the
 * spec requires — refresh tokens must never touch AsyncStorage. A memory cache
 * keeps `get()` cheap for the many authenticated requests per screen.
 */
export function createSecureTokenStore(): HydratableTokenStore {
  let cache: TokenPair | null = null;
  let hydrated = false;

  async function hydrate(): Promise<TokenPair | null> {
    if (hydrated) return cache;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) {
        const parsed = tokenPairSchema.safeParse(JSON.parse(raw));
        cache = parsed.success ? parsed.data : null;
      }
    } catch {
      cache = null;
    }
    hydrated = true;
    return cache;
  }

  return {
    hydrate,
    get: () => (hydrated ? cache : hydrate()),
    set: async (tokens) => {
      cache = tokens;
      hydrated = true;
      try {
        if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
        else await SecureStore.deleteItemAsync(KEY);
      } catch {
        // Keeping the in-memory value is enough to finish the session.
      }
    },
  };
}

/** Shared singleton so the API client and the auth store agree on the session. */
export const tokenStore = createSecureTokenStore();
