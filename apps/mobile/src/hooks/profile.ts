import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteBody } from '@kitchen/contracts';
import { api } from '../lib/api';
import { qk } from './keys';

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api.call('getMe') });
}

export function useProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: () => api.call('getProfile') });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'updateProfile'>) => api.call('updateProfile', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile }),
  });
}

export function useHouseholds() {
  return useQuery({ queryKey: qk.households, queryFn: () => api.call('listHouseholds') });
}

export function useUpdateHousehold(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RouteBody<'updateHousehold'>) =>
      api.call('updateHousehold', { params: { id }, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.households }),
  });
}

export function useRotateInviteCode(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.call('rotateInviteCode', { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.households }),
  });
}

/** Search the ingredient catalog for the manual-add flow. */
export function useSearchIngredients(term: string) {
  return useQuery({
    queryKey: qk.ingredients(term),
    queryFn: () => api.call('searchIngredients', { query: { q: term } }),
    enabled: term.trim().length > 0,
  });
}

export function useAiUsage() {
  return useQuery({ queryKey: qk.aiUsage, queryFn: () => api.call('getAiUsage') });
}
