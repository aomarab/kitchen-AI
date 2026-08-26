import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth';
import { entryRoute } from '../lib/entry-route';

/**
 * Entry gate. Sends the user to the welcome screen, household onboarding, or
 * the app depending on session state. The root layout shows a splash while the
 * session is still hydrating, so a loading session renders nothing here.
 *
 * The decision itself lives in `lib/entry-route` so it can be tested; this
 * component is only the redirect.
 */
export default function Index() {
  const status = useAuthStore((state) => state.status);
  const activeHouseholdId = useAuthStore((state) => state.activeHouseholdId);

  const route = entryRoute(status, activeHouseholdId);
  if (!route) return null;
  return <Redirect href={route} />;
}
