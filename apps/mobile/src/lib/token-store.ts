import * as SecureStore from 'expo-secure-store';
import { tokenPairSchema, type TokenPair } from '@kitchen/contracts';
import type { TokenStore } from '@kitchen/api-client';

const KEY = 'kitchen_tokens';

/**
 * A keychain failure must not end the session — the in-memory copy still works
 * — but swallowing it silently once hid a real bug for a long time. The app
 * shipped with an empty entitlements file, so every keychain call returned
 * `-34018 errSecMissingEntitlement`, the token was never written, and the user
 * was quietly signed out on every cold start with nothing logged anywhere.
 * Dev builds now say so out loud.
 */
function warn(action: 'read' | 'write', error: unknown) {
  if (__DEV__) {
    console.warn(
      `[token-store] Keychain ${action} failed; the session will not survive a restart.`,
      error,
    );
  }
}

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
    } catch (error) {
      cache = null;
      warn('read', error);
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
      } catch (error) {
        // Keeping the in-memory value is enough to finish the session.
        warn('write', error);
      }
    },
  };
}

/** Shared singleton so the API client and the auth store agree on the session. */
export const tokenStore = createSecureTokenStore();
