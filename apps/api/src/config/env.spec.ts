import { describe, expect, it } from 'vitest';
import { corsOrigins, loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/kitchen',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9100',
  S3_BUCKET: 'kitchen',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  JWT_SECRET: 'x'.repeat(32),
} as unknown as NodeJS.ProcessEnv;

/** Everything production additionally insists on, so each test can drop one. */
const prodBase = {
  ...base,
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://kitchen.app',
  GOOGLE_CLIENT_ID: 'my-client.apps.googleusercontent.com',
  APPLE_CLIENT_ID: 'app.kitchen.ios',
} as unknown as NodeJS.ProcessEnv;

describe('environment contract', () => {
  it('defaults to the port both clients point at', () => {
    expect(loadEnv({ ...base }).API_PORT).toBe(3333);
  });

  it('reflects the caller in development when no origins are listed', () => {
    expect(corsOrigins(loadEnv({ ...base }))).toBe(true);
  });

  it('refuses to boot in production without an explicit CORS allowlist', () => {
    // Reflecting an arbitrary origin while allowing credentials would let any
    // site drive an authenticated session once tokens move to cookies.
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
  });

  it('accepts a comma-separated allowlist and trims it', () => {
    const env = loadEnv({
      ...prodBase,
      CORS_ORIGINS: 'https://kitchen.app, https://www.kitchen.app ',
    });
    expect(corsOrigins(env)).toEqual(['https://kitchen.app', 'https://www.kitchen.app']);
  });

  it('refuses to boot in production with live AI but no OpenAI key', () => {
    expect(() => loadEnv({ ...prodBase, AI_MOCK: 'false' })).toThrow(/OPENAI_API_KEY/);
  });

  it('allows a keyless environment while AI is mocked', () => {
    expect(loadEnv({ ...prodBase }).AI_MOCK).toBe(true);
  });

  it('defaults to the mock payment verifier, so the API boots with no RevenueCat account', () => {
    expect(loadEnv({ ...prodBase }).PAYMENTS_MOCK).toBe(true);
  });

  // `PAYMENTS_MOCK=false` must genuinely switch off the always-approves mock —
  // `z.coerce.boolean` would coerce the string "false" to `true` and silently
  // leave the mock live, so the enum+transform is load-bearing here.
  it.each(['REVENUECAT_API_KEY', 'REVENUECAT_WEBHOOK_SECRET'] as const)(
    'refuses to boot in production with live payments but no %s',
    (key) => {
      expect(() =>
        loadEnv({
          ...prodBase,
          PAYMENTS_MOCK: 'false',
          // Provide the *other* key so only `key` is the missing one under test.
          REVENUECAT_API_KEY: key === 'REVENUECAT_API_KEY' ? '' : 'rc-key',
          REVENUECAT_WEBHOOK_SECRET: key === 'REVENUECAT_WEBHOOK_SECRET' ? '' : 'rc-secret',
        }),
      ).toThrow(new RegExp(key));
    },
  );

  it('boots in production with live payments once both RevenueCat values are set', () => {
    const env = loadEnv({
      ...prodBase,
      PAYMENTS_MOCK: 'false',
      REVENUECAT_API_KEY: 'rc-key',
      REVENUECAT_WEBHOOK_SECRET: 'rc-secret',
    });
    expect(env.PAYMENTS_MOCK).toBe(false);
  });

  // Without a client id the `aud` claim is unpinned, so an ID token minted for
  // any other OAuth client is accepted as proof of identity.
  it.each(['GOOGLE_CLIENT_ID', 'APPLE_CLIENT_ID'] as const)(
    'refuses to boot in production without %s',
    (key) => {
      const env = { ...prodBase };
      delete env[key];
      expect(() => loadEnv(env)).toThrow(new RegExp(key));
    },
  );
});

describe('Apple revocation configuration', () => {
  it('defaults to the mock revoker, so the API boots with no Apple credentials', () => {
    const env = loadEnv(prodBase);
    expect(env.APPLE_REVOKE_MOCK).toBe(true);
  });

  it('refuses to boot in production with a live revoker and no key material', () => {
    expect(() =>
      loadEnv({ ...prodBase, NODE_ENV: 'production', APPLE_REVOKE_MOCK: 'false' }),
    ).toThrow();
  });

  it('refuses an encryption key that is not 32 bytes', () => {
    expect(() =>
      loadEnv({
        ...prodBase,
        NODE_ENV: 'production',
        APPLE_REVOKE_MOCK: 'false',
        APPLE_TEAM_ID: 'TEAM123456',
        APPLE_KEY_ID: 'KEY1234567',
        APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----',
        APPLE_TOKEN_ENC_KEY: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow();
  });
});
