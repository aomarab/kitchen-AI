import { createApiClient } from '@kitchen/api-client';
import { tokenStore } from './token-store';
import { getActiveHouseholdId, useAuthStore } from '../stores/auth';
import { markOffline, markOnline } from '../stores/connectivity';
import { startMockServer } from '../mocks';

/**
 * Single API client for the whole app. It is wired to the persistent keychain
 * token store, injects the acting household id, and reports connectivity so the
 * offline queue can replay on reconnect.
 *
 * Mocks vs. real API is a one-line switch: mocks run unless
 * `EXPO_PUBLIC_USE_MOCKS=false`. Nothing else in the app changes.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';
const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

if (USE_MOCKS) {
  startMockServer(API_URL);
}

const trackedFetch: typeof fetch = async (...args) => {
  try {
    const response = await globalThis.fetch(...args);
    markOnline();
    return response;
  } catch (error) {
    markOffline();
    throw error;
  }
};

export const api = createApiClient({
  baseUrl: API_URL,
  tokenStore,
  getHouseholdId: () => getActiveHouseholdId(),
  onAuthExpired: () => {
    void useAuthStore.getState().signOut();
  },
  fetchImpl: trackedFetch,
  validateResponses: true,
});

export const usingMocks = USE_MOCKS;
export const apiBaseUrl = API_URL;
