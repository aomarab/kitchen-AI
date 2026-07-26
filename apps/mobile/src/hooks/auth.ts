import { useMutation } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
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

/** Apple / Google sign in. */
export function useOAuthSignIn() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (body: RouteBody<'oauthLogin'>) => api.call('oauthLogin', { body }),
    onSuccess: (session) => setSession(session),
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
