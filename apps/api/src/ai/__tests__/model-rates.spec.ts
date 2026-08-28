import { describe, expect, it, vi } from 'vitest';
import { estimateCostUsd, MODEL_RATES_USD_PER_MTOK } from '../ai.constants.js';
import { loadEnv } from '../../config/env.js';

describe('estimateCostUsd', () => {
  it('prices a known model from its own rate, not its tier', () => {
    // gpt-5-mini is a cheap-tier model; 1M input tokens at its own input rate.
    const cost = estimateCostUsd('gpt-5-mini', 'cheap', 1_000_000, 0);
    const rate = MODEL_RATES_USD_PER_MTOK['gpt-5-mini'];
    expect(rate).toBeDefined();
    expect(cost).toBeCloseTo(rate!.input, 10);
  });

  it('prices two models on the same tier differently', () => {
    // The whole point: a Gemini vision call must not be billed at OpenAI rates.
    const openai = estimateCostUsd('gpt-5', 'vision', 1_000_000, 1_000_000);
    const gemini = estimateCostUsd('gemini-3-flash', 'vision', 1_000_000, 1_000_000);
    expect(gemini).toBeLessThan(openai);
  });

  it('falls back to the tier rate and warns for an unknown model', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cost = estimateCostUsd('some-unreleased-model', 'cheap', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.15, 10);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sums input and output at their separate rates', () => {
    const rate = MODEL_RATES_USD_PER_MTOK['gpt-5-mini'];
    expect(rate).toBeDefined();
    expect(estimateCostUsd('gpt-5-mini', 'cheap', 2_000_000, 3_000_000)).toBeCloseTo(
      rate!.input * 2 + rate!.output * 3,
      10,
    );
  });

  it('prices embeddings from their own rate, not the tier fallback', () => {
    // text-embedding-3-small is on the cheap tier but has a much lower rate (0.02 vs 0.15).
    // This test must discriminate: it fails if the model entry is missing and the tier fallback is used.
    const cost = estimateCostUsd('text-embedding-3-small', 'cheap', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.02, 10);
  });
});

describe('estimateCostUsd — dated snapshot ids resolve to their alias rate', () => {
  // The vendor returns a resolved snapshot id (e.g. gpt-5-2026-01-15) for an
  // alias, and that is the id that reaches estimateCostUsd. Without prefix
  // normalisation every real call misses the table and is billed at the tier
  // fallback — which on the vision tier is OpenAI's $2.50, a 67% overcharge on
  // a Gemini call.
  it('prices a dated gpt-5 snapshot at the gpt-5 rate', () => {
    expect(estimateCostUsd('gpt-5-2026-01-15', 'vision', 1_000_000, 0)).toBeCloseTo(2.5, 10);
  });

  it('prices a dated gpt-5-mini snapshot at the gpt-5-mini rate', () => {
    expect(estimateCostUsd('gpt-5-mini-2026-01-15', 'cheap', 1_000_000, 0)).toBeCloseTo(0.15, 10);
  });

  it('prices a Gemini preview id at the gemini-3-flash rate, not the OpenAI vision fallback', () => {
    const cost = estimateCostUsd('gemini-3-flash-preview-11-2025', 'vision', 1_000_000, 0);
    expect(cost).toBeCloseTo(1.5, 10);
    // The bug being fixed: this would land on TIER_FALLBACK_RATES.vision = 2.5.
    expect(cost).not.toBeCloseTo(2.5, 10);
  });

  it('resolves the gpt-5-mini vs gpt-5 prefix ambiguity to the longest match', () => {
    // gpt-5 is a prefix of gpt-5-mini-2026-01-15, but the longest matching key
    // must win: pricing this at gpt-5 (2.5) rather than gpt-5-mini (0.15) is a
    // 16x overcharge.
    const cost = estimateCostUsd('gpt-5-mini-2026-01-15', 'cheap', 1_000_000, 1_000_000);
    const mini = estimateCostUsd('gpt-5-mini', 'cheap', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(mini, 10);
    const full = estimateCostUsd('gpt-5', 'planning', 1_000_000, 1_000_000);
    expect(cost).toBeLessThan(full);
  });

  it('still falls back to the tier rate for a genuinely unknown id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cost = estimateCostUsd('totally-made-up-vendor-model', 'cheap', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.15, 10);
    warn.mockRestore();
  });

  it('does not warn for a resolvable dated snapshot id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    estimateCostUsd('gpt-5-2026-06-01', 'vision', 1_000, 0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns once per distinct unresolved id, not once per call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    estimateCostUsd('unknown-model-warn-once', 'cheap', 1_000, 0);
    estimateCostUsd('unknown-model-warn-once', 'cheap', 2_000, 0);
    estimateCostUsd('unknown-model-warn-once', 'cheap', 3_000, 0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('every configured default model is priced by an exact rate', () => {
  // The runtime fallback above keeps an unknown model from being billed at zero,
  // but it only warns — it does not fail the build. So a future default-model
  // swap in env.ts could ship a model that has no exact rate and silently
  // misprices the ai_usage ledger that credit pricing is derived from. These
  // pin each token-billed default id to an EXACT entry in the rate table, so
  // adding a model without adding its rate fails here instead of at runtime.
  const env = loadEnv({
    DATABASE_URL: 'postgres://u:p@localhost:5432/kitchen',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9100',
    S3_BUCKET: 'kitchen',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    JWT_SECRET: 'x'.repeat(32),
  } as unknown as NodeJS.ProcessEnv);
  const keys = Object.keys(MODEL_RATES_USD_PER_MTOK);

  it.each([
    ['OPENAI_MODEL_PLANNING', () => env.OPENAI_MODEL_PLANNING],
    ['OPENAI_MODEL_VISION', () => env.OPENAI_MODEL_VISION],
    ['OPENAI_MODEL_CHEAP', () => env.OPENAI_MODEL_CHEAP],
    ['GEMINI_MODEL_VISION', () => env.GEMINI_MODEL_VISION],
  ])('%s has an exact rate-table entry', (_name, get) => {
    expect(keys).toContain(get());
  });

  it('the hardcoded embeddings model has an exact rate', () => {
    // Mirrors the default in ai/catalog/openai-embeddings.ts (`text-embedding-3-small`).
    expect(keys).toContain('text-embedding-3-small');
  });

  it('the realtime model is deliberately NOT in the token table', () => {
    // gpt-realtime is client<->provider audio, never token-counted through
    // AiGateway; it is priced in realtime-cost.ts, not this table. Asserting its
    // absence documents the split and catches an accidental token-pricing entry.
    expect(keys).not.toContain(env.OPENAI_MODEL_REALTIME);
  });
});
