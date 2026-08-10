import { useMutation } from '@tanstack/react-query';
import type { DeleteMeRequest } from '@kitchen/contracts';
import { api } from '../lib/api';
import { resetAfterAccountDeletion } from '../stores/account-reset';

/**
 * Deletes the signed-in account, then tears down every local trace of it.
 *
 * The reset runs in `onSuccess`, so it happens only after the server confirms
 * the deletion — a failed call (wrong password, offline) leaves the session and
 * the offline queue untouched. The body carries a password for password
 * accounts and nothing for OAuth-only accounts (Task 1's `hasPassword`).
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (body: DeleteMeRequest) => api.call('deleteMe', { body }),
    onSuccess: async () => {
      await resetAfterAccountDeletion();
    },
  });
}
