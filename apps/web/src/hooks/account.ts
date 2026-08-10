import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeleteMeRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import { useMocksReady } from '../mocks/provider';

/** The signed-in user, including `hasPassword` — which decides whether deletion asks for a password. */
export function useMe() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.call('getMe'),
    enabled: ready,
  });
}

/**
 * Every household the user belongs to. Deletion previews the consequence for
 * each, so it needs the full list — not the single-household `useHousehold`.
 * A distinct query key keeps the two caches from stepping on each other.
 */
export function useHouseholds() {
  const ready = useMocksReady();
  return useQuery({
    queryKey: ['households', 'all'],
    queryFn: () => api.call('listHouseholds'),
    enabled: ready,
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const clearSession = useSession((state) => state.clear);

  return useMutation({
    mutationFn: (body: DeleteMeRequest) => api.call('deleteMe', { body }),
    onSuccess: () => {
      // The account is gone; anything cached about it is now a lie. Locale and
      // appearance are deliberately left alone — they are device preferences,
      // and resetting them would flip an Arabic user to English mid-flow.
      clearSession();
      queryClient.clear();
    },
  });
}
