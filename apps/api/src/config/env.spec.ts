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
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://kitchen.app, https://www.kitchen.app ',
    });
    expect(corsOrigins(env)).toEqual(['https://kitchen.app', 'https://www.kitchen.app']);
  });

  it('refuses to boot in production with live AI but no OpenAI key', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://kitchen.app',
        AI_MOCK: 'false',
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it('allows a keyless environment while AI is mocked', () => {
    const env = loadEnv({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://kitchen.app' });
    expect(env.AI_MOCK).toBe(true);
  });
});
