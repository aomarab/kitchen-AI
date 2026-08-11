import { describe, expect, it } from 'vitest';
import { createAiProvider } from '../ai.module.js';
import { MockAiProvider } from '../providers/mock.provider.js';
import { OpenAiProvider } from '../providers/openai.provider.js';
import { GeminiProvider } from '../providers/gemini.provider.js';
import { RoutedAiProvider } from '../providers/routed.provider.js';
import type { Env } from '../../config/env.js';

/** Minimal Env with AI-provider-relevant fields populated. */
function env(overrides: Partial<Env>): Env {
  return {
    NODE_ENV: 'development',
    API_PORT: 3333,
    CORS_ORIGINS: '',
    DATABASE_URL: 'postgresql://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'test',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    S3_FORCE_PATH_STYLE: true,
    JWT_SECRET: 'sixteen-chars-ok',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    GOOGLE_CLIENT_ID: '',
    APPLE_CLIENT_ID: '',
    APPLE_REVOKE_MOCK: true,
    APPLE_TEAM_ID: '',
    APPLE_KEY_ID: '',
    APPLE_PRIVATE_KEY: '',
    APPLE_TOKEN_ENC_KEY: '',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL_PLANNING: 'gpt-5',
    OPENAI_MODEL_VISION: 'gpt-5',
    OPENAI_MODEL_CHEAP: 'gpt-5-mini',
    GEMINI_API_KEY: '',
    GEMINI_MODEL_VISION: 'gemini-3-flash',
    AI_VISION_VENDOR: 'openai',
    AI_MOCK: false,
    AI_DAILY_BUDGET_USD: 2,
    YOUTUBE_API_KEY: '',
    OPEN_FOOD_FACTS_URL: 'https://world.openfoodfacts.org',
    ...overrides,
  } as Env;
}

// Access private bindings only in tests — avoids widening RoutedAiProvider's API.
function bindings(provider: RoutedAiProvider): Record<string, unknown> {
  return (provider as unknown as { bindings: Record<string, unknown> }).bindings;
}

describe('createAiProvider', () => {
  it('returns MockAiProvider when AI_MOCK is true, regardless of AI_VISION_VENDOR', () => {
    const provider = createAiProvider(env({ AI_MOCK: true, AI_VISION_VENDOR: 'gemini' }));
    expect(provider.kind).toBe('mock');
    expect(provider).toBeInstanceOf(MockAiProvider);
  });

  it('returns RoutedAiProvider with OpenAiProvider for all tiers when AI_VISION_VENDOR is openai', () => {
    const provider = createAiProvider(env({ AI_MOCK: false, AI_VISION_VENDOR: 'openai' }));
    expect(provider.kind).toBe('routed');
    expect(provider).toBeInstanceOf(RoutedAiProvider);
    const b = bindings(provider as RoutedAiProvider);
    expect(b.cheap).toBeInstanceOf(OpenAiProvider);
    expect(b.vision).toBeInstanceOf(OpenAiProvider);
    expect(b.planning).toBeInstanceOf(OpenAiProvider);
    // All three must be the same instance.
    expect(b.cheap).toBe(b.vision);
    expect(b.cheap).toBe(b.planning);
  });

  it('uses GeminiProvider for vision and OpenAiProvider for cheap/planning when AI_VISION_VENDOR is gemini', () => {
    const provider = createAiProvider(
      env({ AI_MOCK: false, AI_VISION_VENDOR: 'gemini', GEMINI_API_KEY: 'gemini-key' }),
    );
    expect(provider.kind).toBe('routed');
    expect(provider).toBeInstanceOf(RoutedAiProvider);
    const b = bindings(provider as RoutedAiProvider);
    expect(b.vision).toBeInstanceOf(GeminiProvider);
    expect(b.cheap).toBeInstanceOf(OpenAiProvider);
    expect(b.planning).toBeInstanceOf(OpenAiProvider);
    expect(b.cheap).toBe(b.planning);
    expect(b.cheap).not.toBe(b.vision);
  });

  it('throws when AI_VISION_VENDOR is gemini and GEMINI_API_KEY is empty', () => {
    expect(() =>
      createAiProvider(env({ AI_MOCK: false, AI_VISION_VENDOR: 'gemini', GEMINI_API_KEY: '' })),
    ).toThrow(/GEMINI_API_KEY/);
  });
});
