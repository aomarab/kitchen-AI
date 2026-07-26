import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateProfileRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

export function useProfile() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.call('getProfile'),
    enabled: ready,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.call('updateProfile', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useHousehold() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['households'],
    queryFn: async () => {
      const households = await api.call('listHouseholds');
      return households[0] ?? null;
    },
    enabled: ready,
  });
}

export function useAiUsage() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.call('getAiUsage'),
    enabled: ready,
  });
}
