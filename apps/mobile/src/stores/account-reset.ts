import { queryClient } from '../lib/queryClient';
import { useAuthStore } from './auth';
import { useOfflineQueue } from './offline-queue';

/**
 * Local teardown after the server has deleted the account.
 *
 * Broader than sign-out on purpose: sign-out leaves queued offline events alone
 * because the same user will come back. Here they must go, or the queue replays
 * inventory writes on reconnect for a user who no longer exists. Sign-out also
 * wipes the keychain-backed token store, so a deleted account keeps no
 * credentials on the device.
 *
 * Locale and appearance are deliberately kept. They are device preferences, not
 * account data, and clearing them would drop an Arabic user onto an English
 * sign-in screen.
 */
export async function resetAfterAccountDeletion(): Promise<void> {
  await useOfflineQueue.getState().clear();
  await useAuthStore.getState().signOut();
  queryClient.clear();
}
