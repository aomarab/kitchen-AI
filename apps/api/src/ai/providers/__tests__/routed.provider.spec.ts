import { describe, expect, it, vi } from 'vitest';
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
