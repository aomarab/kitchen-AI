import { useMutation } from '@tanstack/react-query';
import type {
  CreateHouseholdRequest,
  JoinHouseholdRequest,
  LoginRequest,
  OAuthProvider,
  RegisterRequest,
  Session,
} from '@kitchen/contracts';
import { api } from '../lib/api';
import { useSession } from '../stores/session';

function persist(session: Session) {
  void api.tokenStore.set(session.tokens);
  useSession.getState().setSession(session);
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginRequest) => api.call('login', { body }),
    onSuccess: persist,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => api.call('register', { body }),
    onSuccess: persist,
  });
}

export function useOAuthLogin() {
  return useMutation({
    mutationFn: (provider: OAuthProvider) =>
      api.call('oauthLogin', { body: { provider, idToken: `mock-${provider}-token` } }),
    onSuccess: persist,
  });
}

export function useCreateHousehold() {
  return useMutation({
    mutationFn: (body: CreateHouseholdRequest) => api.call('createHousehold', { body }),
    onSuccess: (household) => useSession.getState().setHouseholdId(household.id),
  });
}

export function useJoinHousehold() {
  return useMutation({
    mutationFn: (body: JoinHouseholdRequest) => api.call('joinHousehold', { body }),
    onSuccess: (household) => useSession.getState().setHouseholdId(household.id),
  });
}
