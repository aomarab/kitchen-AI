import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile, UpdateProfileRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

const PROFILE_MUTATION_KEY = ['profile', 'update'] as const;

export function useProfile() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.call('getProfile'),
    enabled: ready,
  });
}

/**
 * Profile updates are applied to the cache immediately.
 *
 * Every toggle in Settings sends a whole array derived from the cached profile.
 * Without this, a second toggle pressed before the first response lands reads
 * the *pre-first-toggle* cache and sends an array that undoes it — so selecting
 * three cuisines quickly keeps only the last one. Writing the merged value into
 * the cache in `onMutate` means the next toggle builds on it.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.call('updateProfile', { body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['profile'] });
      const previous = qc.getQueryData<Profile>(['profile']);
      if (previous) qc.setQueryData<Profile>(['profile'], { ...previous, ...body });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) qc.setQueryData(['profile'], context.previous);
    },
    onSettled: () => {
      // Only the last in-flight mutation refetches; otherwise an earlier
      // response would clobber a later optimistic value.
      if (qc.isMutating({ mutationKey: PROFILE_MUTATION_KEY }) === 1) {
        void qc.invalidateQueries({ queryKey: ['profile'] });
      }
    },
    mutationKey: PROFILE_MUTATION_KEY,
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
