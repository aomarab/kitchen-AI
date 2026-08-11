import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile, UpdateProfileRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useMocksReady } from '../mocks/provider';

const PROFILE_MUTATION_KEY = ['profile', 'update'] as const;

/**
 * Monotonic ticket per profile mutation. `isMutating()` cannot answer "am I the
 * newest?" — when two responses settle in the same event-loop turn, both
 * `onSettled` callbacks run before either dispatches its completion, so both
 * observe the same pending count and neither considers itself last. A counter
 * captured at mutate time is decided at the only moment that is unambiguous.
 */
let profileMutationSeq = 0;

export function useProfile() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.call('getProfile'),
    enabled: ready,
  });
}

interface ProfileMutationContext {
  previous: Profile | undefined;
  /** Exactly what this mutation wrote, so rollback can tell if it still stands. */
  optimistic: Profile | undefined;
  seq: number;
}

/**
 * Profile updates are applied to the cache immediately.
 *
 * Every toggle in Settings sends a whole array derived from the cached profile.
 * Without this, a second toggle pressed before the first response lands reads
 * the *pre-first-toggle* cache and sends an array that undoes it — so selecting
 * three cuisines quickly keeps only the last one. Writing the merged value into
 * the cache in `onMutate` means the next toggle builds on it.
 *
 * Overlapping mutations make both halves of that subtle:
 *
 * - **Rollback** must not restore a snapshot taken before a *later* toggle. An
 *   earlier request failing would otherwise erase a newer change the user made
 *   in the meantime — possibly one the server already accepted. So a mutation
 *   only rolls back if its own optimistic value is still the one in the cache.
 * - **Refetching** must only happen for the newest mutation, or a slow earlier
 *   response overwrites a newer optimistic value.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.call('updateProfile', { body }),
    onMutate: async (body): Promise<ProfileMutationContext> => {
      await qc.cancelQueries({ queryKey: ['profile'] });
      const previous = qc.getQueryData<Profile>(['profile']);
      if (previous) qc.setQueryData<Profile>(['profile'], { ...previous, ...body });
      // Read back rather than keeping the object we passed in: setQueryData
      // applies structural sharing, so what lands in the cache is not
      // reference-equal to what we handed it.
      const optimistic = previous ? qc.getQueryData<Profile>(['profile']) : undefined;
      return { previous, optimistic, seq: ++profileMutationSeq };
    },
    onError: (_error, _body, context) => {
      if (!context?.previous || !context.optimistic) return;
      // Only undo our own write. If a later toggle has since replaced it,
      // that value is newer than anything we could restore.
      if (qc.getQueryData<Profile>(['profile']) !== context.optimistic) return;
      qc.setQueryData(['profile'], context.previous);
    },
    onSettled: (_data, _error, _body, context) => {
      if (context?.seq === profileMutationSeq) {
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
