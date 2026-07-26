import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/errors.js';
import { loadEnv, type Env } from '../config/env.js';
import { OAuthService } from './oauth.service.js';

function envWith(overrides: Partial<Env>): Env {
  return { ...loadEnv(), ...overrides };
}

/**
 * Stubs `fetch` so the Google `tokeninfo` call returns a well-formed payload
 * with the given `aud`, letting us exercise the audience-pinning branch of
 * `verifyGoogle` without any network access.
 */
/** Distinguishes "the provider omitted the claim" from "the claim is false". */
const ABSENT = Symbol('absent');

function stubGoogleTokeninfo(
  aud: string,
  emailVerified: boolean | string | typeof ABSENT = 'true',
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        sub: 'google-sub-123',
        email: 'user@example.com',
        ...(emailVerified === ABSENT ? {} : { email_verified: emailVerified }),
        iss: 'https://accounts.google.com',
        aud,
        exp: String(Math.floor(Date.now() / 1000) + 3600),
      }),
    })),
  );
}

describe('OAuthService audience pinning', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a Google token whose aud does not match the configured client id', async () => {
    stubGoogleTokeninfo('attacker-client-id.apps.googleusercontent.com');
    const service = new OAuthService(
      envWith({ GOOGLE_CLIENT_ID: 'my-client.apps.googleusercontent.com' }),
    );

    await expect(service.verify('google', 'header.body.sig')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a Google token with an AppError instance (not a leaked internal error)', async () => {
    stubGoogleTokeninfo('attacker-client-id.apps.googleusercontent.com');
    const service = new OAuthService(
      envWith({ GOOGLE_CLIENT_ID: 'my-client.apps.googleusercontent.com' }),
    );

    await expect(service.verify('google', 'header.body.sig')).rejects.toBeInstanceOf(AppError);
  });

  it('accepts a Google token whose aud matches the configured client id', async () => {
    const clientId = 'my-client.apps.googleusercontent.com';
    stubGoogleTokeninfo(clientId);
    const service = new OAuthService(envWith({ GOOGLE_CLIENT_ID: clientId }));

    const identity = await service.verify('google', 'header.body.sig');

    expect(identity).toEqual({ providerAccountId: 'google-sub-123', email: 'user@example.com' });
  });

  it('skips aud pinning outside production when the client id is unset', async () => {
    stubGoogleTokeninfo('any-aud-whatsoever');
    const service = new OAuthService(
      envWith({ GOOGLE_CLIENT_ID: '', NODE_ENV: 'development' }),
    );

    const identity = await service.verify('google', 'header.body.sig');

    expect(identity.providerAccountId).toBe('google-sub-123');
  });

  it('refuses to verify in production when the client id is unset', async () => {
    stubGoogleTokeninfo('any-aud-whatsoever');
    const service = new OAuthService(envWith({ GOOGLE_CLIENT_ID: '', NODE_ENV: 'production' }));

    await expect(service.verify('google', 'header.body.sig')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('OAuthService email verification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const clientId = 'my-client.apps.googleusercontent.com';

  // The caller links an OAuth identity to an existing account by email, so an
  // unverified address is an account takeover: anyone who can mint a token
  // naming the victim's email would inherit their session.
  it.each([
    { label: 'the boolean false', claim: false as boolean | string | typeof ABSENT },
    { label: 'the string "false"', claim: 'false' as boolean | string | typeof ABSENT },
    { label: 'no email_verified claim at all', claim: ABSENT as boolean | string | typeof ABSENT },
  ])('withholds the email given $label', async ({ claim }) => {
    stubGoogleTokeninfo(clientId, claim);
    const service = new OAuthService(envWith({ GOOGLE_CLIENT_ID: clientId }));

    const identity = await service.verify('google', 'header.body.sig');

    expect(identity.email).toBeNull();
  });

  it('returns the email when the provider reports it verified', async () => {
    stubGoogleTokeninfo(clientId, 'true');
    const service = new OAuthService(envWith({ GOOGLE_CLIENT_ID: clientId }));

    await expect(service.verify('google', 'header.body.sig')).resolves.toMatchObject({
      email: 'user@example.com',
    });
  });
});
