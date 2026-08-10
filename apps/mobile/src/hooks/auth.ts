import { useMutation } from '@tanstack/react-query';
import type { OAuthProvider, RouteBody, Session } from '@kitchen/contracts';
import { api } from '../lib/api';
import { requestIdentityToken } from '../lib/oauth';
import { useAuthStore } from '../stores/auth';
import { queryClient } from '../lib/queryClient';
import { qk } from './keys';

/** Email + password sign in. Persists the session on success. */
export function useSignIn() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (body: RouteBody<'login'>) => api.call('login', { body }),
    onSuccess: (session) => setSession(session),
  });
}

/** Create a new account. */
export function useSignUp() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (body: RouteBody<'register'>) => api.call('register', { body }),
    onSuccess: (session) => setSession(session),
  });
}

/**
 * Apple / Google sign in. The provider sheet runs first and returns an identity
 * token for the API to verify; a dismissed sheet resolves to `null` so the
 * caller can treat backing out as a no-op rather than a failure.
 */
export function useOAuthSignIn() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: async (provider: OAuthProvider): Promise<Session | null> => {
      const credential = await requestIdentityToken(provider);
      if (credential === null) return null;
      return api.call('oauthLogin', {
        body: {
          provider,
          idToken: credential.idToken,
          authorizationCode: credential.authorizationCode,
        },
      });
    },
    onSuccess: (session) => {
      if (session) setSession(session);
    },
  });
}

/** Create a household and make it active. */
export function useCreateHousehold() {
  const addHousehold = useAuthStore((state) => state.addHousehold);
  return useMutation({
    mutationFn: (body: RouteBody<'createHousehold'>) => api.call('createHousehold', { body }),
    onSuccess: (household) => {
      addHousehold(household.id);
      void queryClient.invalidateQueries({ queryKey: qk.households });
    },
  });
}

/** Join a household by 6-character invite code. */
export function useJoinHousehold() {
  const addHousehold = useAuthStore((state) => state.addHousehold);
  return useMutation({
    mutationFn: (body: RouteBody<'joinHousehold'>) => api.call('joinHousehold', { body }),
    onSuccess: (household) => {
      addHousehold(household.id);
      void queryClient.invalidateQueries({ queryKey: qk.households });
    },
  });
}
