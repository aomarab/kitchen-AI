import { create } from 'zustand';
import type { Session, User } from '@kitchen/contracts';
import { tokenStore } from '../lib/token-store';
import { readJson, writeJson, removeJson } from '../lib/storage';
import { queryClient } from '../lib/queryClient';

const PERSIST_KEY = 'session';

interface PersistedSession {
  user: User | null;
  householdIds: string[];
  activeHouseholdId: string | null;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState extends PersistedSession {
  status: AuthStatus;
  setSession: (session: Session) => void;
  setActiveHousehold: (householdId: string) => void;
  /** After creating or joining a household: add it and make it active. */
  addHousehold: (householdId: string) => void;
  hydrate: () => Promise<void>;
  signOut: () => Promise<void>;
}

function persist(state: PersistedSession): void {
  void writeJson(PERSIST_KEY, state);
}

/**
 * Query keys carry no user or household id, and the household is sent as a
 * request *header* — so every cached entry for one household sits under exactly
 * the key the next household will read. React Query serves cached data
 * synchronously on mount and refetches behind it, so without this the first
 * frames after a sign-out or a household switch render the previous
 * household's inventory, plans and shopping list to whoever is looking now.
 */
function dropCachedHouseholdData(): void {
  // removeQueries, not clear(): clear() also wipes the *mutation* cache, and
  // this runs from inside a mutation's own onSuccess (create/join household).
  queryClient.removeQueries();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  householdIds: [],
  activeHouseholdId: null,

  setSession: (session) => {
    dropCachedHouseholdData();
    const next: PersistedSession = {
      user: session.user,
      householdIds: session.householdIds,
      activeHouseholdId: session.householdIds[0] ?? null,
    };
    void tokenStore.set(session.tokens);
    persist(next);
    set({ ...next, status: 'signedIn' });
  },

  setActiveHousehold: (householdId) => {
    if (get().activeHouseholdId === householdId) return;
    dropCachedHouseholdData();
    const next: PersistedSession = { ...snapshot(get()), activeHouseholdId: householdId };
    persist(next);
    set({ activeHouseholdId: householdId });
  },

  addHousehold: (householdId) => {
    const current = snapshot(get());
    const householdIds = current.householdIds.includes(householdId)
      ? current.householdIds
      : [...current.householdIds, householdId];
    const next: PersistedSession = { ...current, householdIds, activeHouseholdId: householdId };
    if (current.activeHouseholdId !== householdId) dropCachedHouseholdData();
    persist(next);
    set({ householdIds, activeHouseholdId: householdId });
  },

  hydrate: async () => {
    const tokens = await tokenStore.hydrate();
    const saved = await readJson<PersistedSession>(PERSIST_KEY);
    if (tokens && saved?.user) {
      set({
        status: 'signedIn',
        user: saved.user,
        householdIds: saved.householdIds ?? [],
        activeHouseholdId: saved.activeHouseholdId ?? saved.householdIds?.[0] ?? null,
      });
    } else {
      set({ status: 'signedOut' });
    }
  },

  signOut: async () => {
    dropCachedHouseholdData();
    await tokenStore.set(null);
    await removeJson(PERSIST_KEY);
    set({ status: 'signedOut', user: null, householdIds: [], activeHouseholdId: null });
  },
}));

function snapshot(state: PersistedSession): PersistedSession {
  return {
    user: state.user,
    householdIds: state.householdIds,
    activeHouseholdId: state.activeHouseholdId,
  };
}

/** Read the acting household id outside React (used by the API client header). */
export function getActiveHouseholdId(): string | null {
  return useAuthStore.getState().activeHouseholdId;
}
