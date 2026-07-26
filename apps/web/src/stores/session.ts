import { create } from 'zustand';
import type { Session, User } from '@kitchen/contracts';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionState {
  /** `loading` until the stored token has been resolved on first load. */
  status: SessionStatus;
  user: User | null;
  /** Household that household-scoped requests act as; `null` until one exists. */
  householdId: string | null;
  householdIds: string[];
  setSession: (session: Session) => void;
  hydrate: (user: User, householdIds: string[]) => void;
  setHouseholdId: (id: string) => void;
  markUnauthenticated: () => void;
  clear: () => void;
}

const SIGNED_OUT = {
  status: 'unauthenticated' as const,
  user: null,
  householdId: null,
  householdIds: [] as string[],
};

/**
 * Client-side session. There is deliberately *no* default household: an
 * unauthenticated visitor resolves to `null`, so the shell gate redirects them
 * to sign-in instead of rendering as if signed in (spec §6.1).
 */
export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  user: null,
  householdId: null,
  householdIds: [],
  setSession: (session) =>
    set({
      status: 'authenticated',
      user: session.user,
      householdIds: session.householdIds,
      householdId: session.householdIds[0] ?? null,
    }),
  hydrate: (user, householdIds) =>
    set({
      status: 'authenticated',
      user,
      householdIds,
      householdId: householdIds[0] ?? null,
    }),
  setHouseholdId: (id) =>
    set((state) => ({
      status: 'authenticated',
      householdId: id,
      householdIds: state.householdIds.includes(id) ? state.householdIds : [...state.householdIds, id],
    })),
  markUnauthenticated: () => set(SIGNED_OUT),
  clear: () => set(SIGNED_OUT),
}));
