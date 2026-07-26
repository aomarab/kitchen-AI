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
function stubGoogleTokeninfo(aud: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        sub: 'google-sub-123',
        email: 'user@example.com',
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

  it('skips aud pinning when the client id is unset (empty)', async () => {
    stubGoogleTokeninfo('any-aud-whatsoever');
    const service = new OAuthService(envWith({ GOOGLE_CLIENT_ID: '' }));

    const identity = await service.verify('google', 'header.body.sig');

    expect(identity.providerAccountId).toBe('google-sub-123');
  });
});
