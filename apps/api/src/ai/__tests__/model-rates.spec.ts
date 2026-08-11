import { describe, expect, it, vi } from 'vitest';
import { estimateCostUsd, MODEL_RATES_USD_PER_MTOK } from '../ai.constants.js';

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

