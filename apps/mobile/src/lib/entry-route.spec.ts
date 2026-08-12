import { describe, expect, it } from 'vitest';
import { entryRoute, shouldRedirectSignedOut } from './entry-route';

describe('the entry gate', () => {
  it('renders nothing while the session is still hydrating', () => {
    // A redirect here would fire before a stored session had a chance to
    // resolve, throwing a signed-in user out to the intro on every cold start.
    expect(entryRoute('loading', null)).toBeNull();
    expect(entryRoute('loading', 'household-1')).toBeNull();
  });

  it('sends a signed-out visitor to the intro rather than straight to a password field', () => {
    expect(entryRoute('signedOut', null)).toBe('/welcome');
  });

  it('still shows the intro when a stale household id outlives the session', () => {
    // Sign-out clears the session before the household id in some paths, and
    // the status is the authority: a signed-out user must never route into the
    // app shell just because an id was left behind.
    expect(entryRoute('signedOut', 'household-1')).toBe('/welcome');
  });

  it('sends a signed-in user with no household to household setup', () => {
    expect(entryRoute('signedIn', null)).toBe('/onboarding');
  });

  it('sends a fully set-up user to the app', () => {
    expect(entryRoute('signedIn', 'household-1')).toBe('/home');
  });
});

describe('the mid-session signed-out redirect', () => {
  it('stays quiet on the entry gate so it does not race it', () => {
    // Regression: `/` has no segments, so this used to fire and replace the
    // gate's `/welcome` with `/sign-in` — the intro was unreachable on a cold
    // start even though the gate pointed at it.
    expect(shouldRedirectSignedOut(true, 'signedOut', [])).toBe(false);
  });

  it('stays quiet inside the auth group so it does not interrupt typing', () => {
    expect(shouldRedirectSignedOut(true, 'signedOut', ['(auth)', 'sign-in'])).toBe(false);
    expect(shouldRedirectSignedOut(true, 'signedOut', ['(auth)', 'welcome'])).toBe(false);
  });

  it('fires when a session expires while the user is deep in the app', () => {
    expect(shouldRedirectSignedOut(true, 'signedOut', ['(tabs)', 'home'])).toBe(true);
  });

  it('waits until the session has hydrated', () => {
    expect(shouldRedirectSignedOut(false, 'signedOut', ['(tabs)', 'home'])).toBe(false);
    expect(shouldRedirectSignedOut(true, 'loading', ['(tabs)', 'home'])).toBe(false);
    expect(shouldRedirectSignedOut(true, 'signedIn', ['(tabs)', 'home'])).toBe(false);
  });
});
