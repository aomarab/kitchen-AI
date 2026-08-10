import { beforeEach, describe, expect, it, vi } from 'vitest';

// The stores reach the OS keychain and document directory through Expo native
// modules that do not parse in a node test runner. Mock them at the boundary so
// the pure reset logic can be exercised, and so the token-clearing assertion has
// a spy to check. `vi.hoisted` lets the factories reference the spies while
// still being hoisted above the imports.
const { secureStore, fileSystem } = vi.hoisted(() => ({
  secureStore: {
    getItemAsync: vi.fn(async (_key: string) => null as string | null),
    setItemAsync: vi.fn(async (_key: string, _value: string) => undefined),
    deleteItemAsync: vi.fn(async (_key: string) => undefined),
  },
  fileSystem: {
    documentDirectory: 'file:///doc/',
    getInfoAsync: vi.fn(async (_uri: string) => ({ exists: false })),
    readAsStringAsync: vi.fn(async (_uri: string) => '{}'),
    writeAsStringAsync: vi.fn(async (_uri: string, _contents: string) => undefined),
    deleteAsync: vi.fn(async (_uri: string, _options?: { idempotent?: boolean }) => undefined),
  },
}));
vi.mock('expo-secure-store', () => secureStore);
vi.mock('expo-file-system/legacy', () => fileSystem);

import { useOfflineQueue } from './offline-queue';
import { useAuthStore } from './auth';
import { resetAfterAccountDeletion } from './account-reset';
import type { Session } from '@kitchen/contracts';

function signedInSession(): Session {
  return {
    user: {
      id: 'user-1',
      email: 'a@example.com',
      displayName: 'A',
      locale: 'en',
      hasPassword: true,
    },
    householdIds: ['hh-1'],
    tokens: { accessToken: 'a', refreshToken: 'r', expiresIn: 900 },
  } as Session;
}

describe('resetAfterAccountDeletion', () => {
  beforeEach(() => {
    // Block body on purpose: an arrow with an implicit return hands Vitest a
    // teardown callback, which it then runs after every test.
    useOfflineQueue.setState({ events: [], rejected: [] });
    useAuthStore.setState({
      status: 'signedOut',
      user: null,
      householdIds: [],
      activeHouseholdId: null,
    });
    secureStore.deleteItemAsync.mockClear();
    fileSystem.deleteAsync.mockClear();
  });

  it('empties the offline queue, so nothing replays for a deleted user', async () => {
    useOfflineQueue.setState({
      events: [
        {
          userId: 'user-1',
          householdId: 'hh-1',
          event: { clientEventId: 'evt-1' },
        } as never,
      ],
    });

    await resetAfterAccountDeletion();

    expect(useOfflineQueue.getState().events).toEqual([]);
  });

  it('clears the auth session', async () => {
    useAuthStore.getState().setSession(signedInSession());
    expect(useAuthStore.getState().user).not.toBeNull();

    await resetAfterAccountDeletion();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('clears the persisted token pair, not just the in-memory session', async () => {
    useAuthStore.getState().setSession(signedInSession());

    await resetAfterAccountDeletion();

    // The keychain-backed token store must be wiped, or a deleted account's
    // credentials survive on the device — the exact defect the web half missed.
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('kitchen_tokens');
  });

  it('clears the persisted offline queue, not just the in-memory copy', async () => {
    await resetAfterAccountDeletion();

    const clearedQueueFile = fileSystem.deleteAsync.mock.calls.some(([uri]) =>
      String(uri).includes('offline_events'),
    );
    expect(clearedQueueFile).toBe(true);
  });
});
