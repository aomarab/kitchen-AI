import type { AuthStatus } from '../stores/auth';

/** Where the entry gate sends the user, or `null` while the session hydrates. */
export type EntryRoute = '/welcome' | '/onboarding' | '/home';

/**
 * The entry gate's decision, kept out of the screen so it can be tested. The
 * screen itself is a `<Redirect>` and nothing else, and this app has no native
 * render harness, so a rule expressed only as JSX is a rule nothing checks.
 *
 * Returns `null` while the session is still loading — the root layout is
 * showing the splash then, and redirecting mid-hydration would bounce the user
 * out of a session that was about to resolve.
 */
export function entryRoute(
  status: AuthStatus,
  activeHouseholdId: string | null,
): EntryRoute | null {
  if (status === 'loading') return null;
  // The intro is the signed-out home rather than a one-time tour, so there is
  // no "already seen" flag: a returning user reaches sign-in in one tap.
  if (status === 'signedOut') return '/welcome';
  // Signed in but with no household yet — the account exists, the kitchen does
  // not, and every household-scoped screen would 400 without one.
  if (!activeHouseholdId) return '/onboarding';
  return '/home';
}

/**
 * Whether the root layout should bounce a signed-out user to sign-in.
 *
 * This exists for sessions that end *mid-use* — a 401 leaves the user on a
 * screen whose every query now fails. It deliberately stays quiet in two
 * places: inside the auth group, where it would fight someone typing their
 * password, and on the entry gate itself (`segments` empty), which runs
 * `entryRoute` and sends a signed-out visitor to the intro. Firing there too
 * just races the gate and overwrites the right answer with the wrong one.
 */
export function shouldRedirectSignedOut(
  ready: boolean,
  status: AuthStatus,
  segments: readonly string[],
): boolean {
  if (!ready || status !== 'signedOut') return false;
  if (segments.length === 0) return false;
  if (segments[0] === '(auth)') return false;
  return true;
}
