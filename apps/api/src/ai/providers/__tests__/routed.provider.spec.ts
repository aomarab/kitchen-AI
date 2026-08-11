import { describe, expect, it, vi } from 'vitest';
import { attachSpend, readPriorAttempts } from '../../ai-spend.js';
import { RoutedAiProvider } from '../routed.provider.js';
import type { AiProvider, StructuredRequest } from '../ai-provider.interface.js';

function stub(name: string): AiProvider & { complete: ReturnType<typeof vi.fn> } {
  return {
    kind: 'mock',
    complete: vi.fn().mockResolvedValue({
      raw: { from: name },
      usage: { inputTokens: 1, outputTokens: 1 },
      model: name,
    }),
  } as never;
}

function request(tier: 'cheap' | 'vision' | 'planning'): StructuredRequest {
  return {
    operation: tier === 'vision' ? 'vision.recognize' : 'name.resolve',
    tier,
    system: 's',
    user: 'u',
  };
}

describe('RoutedAiProvider', () => {
  it('sends each tier to its bound provider', async () => {
    const cheap = stub('cheap-model');
    const vision = stub('vision-model');
    const planning = stub('planning-model');
    const routed = new RoutedAiProvider({ cheap, vision, planning });

    await routed.complete(request('cheap'));
    await routed.complete(request('vision'));
    await routed.complete(request('planning'));

    expect(cheap.complete).toHaveBeenCalledTimes(1);
    expect(vision.complete).toHaveBeenCalledTimes(1);
    expect(planning.complete).toHaveBeenCalledTimes(1);
  });

  it('returns the bound provider result unchanged', async () => {
    const vision = stub('vision-model');
    const routed = new RoutedAiProvider({ cheap: stub('c'), vision, planning: stub('p') });

    const result = await routed.complete(request('vision'));

    expect(result.model).toBe('vision-model');
    expect(result.raw).toEqual({ from: 'vision-model' });
  });

  it('does not swallow an error when no fallback is configured', async () => {
    const vision = stub('vision-model');
    vision.complete.mockRejectedValue(new Error('upstream down'));
    const routed = new RoutedAiProvider({ cheap: stub('c'), vision, planning: stub('p') });

    await expect(routed.complete(request('vision'))).rejects.toThrow('upstream down');
  });
});

describe('RoutedAiProvider fallback', () => {
  it('retries the vision tier on the fallback provider', async () => {
    const vision = stub('gemini');
    vision.complete.mockRejectedValue(new Error('gemini down'));
    const fallback = stub('openai');
    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision, planning: stub('p') },
      { vision: fallback },
    );

    const result = await routed.complete(request('vision'));

    expect(result.model).toBe('openai');
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });

  it('makes at most one hop', async () => {
    const vision = stub('gemini');
    vision.complete.mockRejectedValue(new Error('gemini down'));
    const fallback = stub('openai');
    fallback.complete.mockRejectedValue(new Error('openai down too'));
    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision, planning: stub('p') },
      { vision: fallback },
    );

    await expect(routed.complete(request('vision'))).rejects.toThrow('openai down too');
    expect(vision.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });

  it("preserves the primary's spend on the error when the fallback also fails", async () => {
    // The primary billed us before failing; that spend must not be silently
    // dropped just because the fallback also failed. AiGateway reads
    // readPriorAttempts(error) on the throw path to record it.
    const vision = stub('gemini');
    const primaryError = Object.assign(new Error('gemini truncated'), {});
    attachSpend(primaryError, { usage: { inputTokens: 900, outputTokens: 100 }, model: 'gemini' });
    vision.complete.mockRejectedValue(primaryError);

    const fallback = stub('openai');
    fallback.complete.mockRejectedValue(new Error('openai down too'));

    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision, planning: stub('p') },
      { vision: fallback },
    );

    const thrown = await routed.complete(request('vision')).catch((e: unknown) => e);
    expect(thrown).toMatchObject({ message: 'openai down too' });
    const prior = readPriorAttempts(thrown);
    expect(prior).toEqual([{ usage: { inputTokens: 900, outputTokens: 100 }, model: 'gemini' }]);
  });

  it('does not fall back on cheap or planning', async () => {
    const cheap = stub('cheap');
    cheap.complete.mockRejectedValue(new Error('cheap down'));
    const fallback = stub('openai');
    const routed = new RoutedAiProvider(
      { cheap, vision: stub('v'), planning: stub('p') },
      { vision: fallback },
    );

    await expect(routed.complete(request('cheap'))).rejects.toThrow('cheap down');
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('reports what the failed attempt already cost', async () => {
    // A model that answered unusably still billed us. Dropping that spend is
    // exactly the error a credit ledger cannot absorb.
    const vision = stub('gemini');
    const billed = Object.assign(new Error('bad output'), {});
    attachSpend(billed, { usage: { inputTokens: 900, outputTokens: 100 }, model: 'gemini' });
    vision.complete.mockRejectedValue(billed);

    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision, planning: stub('p') },
      { vision: stub('openai') },
    );

    const result = await routed.complete(request('vision'));

    expect(result.priorAttempts).toEqual([
      { usage: { inputTokens: 900, outputTokens: 100 }, model: 'gemini' },
    ]);
  });

  it('reports no prior attempts when the primary succeeded', async () => {
    const routed = new RoutedAiProvider(
      { cheap: stub('c'), vision: stub('gemini'), planning: stub('p') },
      { vision: stub('openai') },
    );

    const result = await routed.complete(request('vision'));

    expect(result.priorAttempts ?? []).toEqual([]);
  });
});
