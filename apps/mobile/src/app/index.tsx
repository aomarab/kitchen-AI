import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth';

/**
 * Entry gate. Sends the user to sign-in, household onboarding, or the app
 * depending on session state. The root layout shows a splash while the session
 * is still hydrating, so `loading` renders nothing here.
 */
export default function Index() {
  const status = useAuthStore((state) => state.status);
  const activeHouseholdId = useAuthStore((state) => state.activeHouseholdId);

  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  if (!activeHouseholdId) return <Redirect href="/onboarding" />;
  return <Redirect href="/home" />;
}
