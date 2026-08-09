import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SchemaGuard } from '../validation/schema-guard.js';
import type {
  AiProvider,
  StructuredRequest,
  StructuredResponse,
} from '../providers/ai-provider.interface.js';

const schema = z.object({ value: z.number() });

function provider(sequence: unknown[]): AiProvider {
  let i = 0;
  return {
    kind: 'mock',
    async complete(_request: StructuredRequest): Promise<StructuredResponse> {
      const raw = sequence[Math.min(i, sequence.length - 1)];
      i += 1;
      return { raw, usage: { inputTokens: 10, outputTokens: 5 }, model: 'mock-test' };
    },
  };
}

const request: StructuredRequest = {
  operation: 'plan.generate',
  tier: 'planning',
  system: 'sys',
  user: 'usr',
};

describe('SchemaGuard (spec §8 — validate every AI response)', () => {
  it('returns data on a first-time valid response (attempts = 1)', async () => {
    const guard = new SchemaGuard();
    const result = await guard.run(provider([{ value: 1 }]), request, schema);
    expect(result.data).toEqual({ value: 1 });
    expect(result.attempts).toBe(1);
  });

  it('makes exactly one repair attempt then succeeds (attempts = 2)', async () => {
    const guard = new SchemaGuard();
    const result = await guard.run(
      provider([{ value: 'not-a-number' }, { value: 42 }]),
      request,
      schema,
    );
    expect(result.data).toEqual({ value: 42 });
    expect(result.attempts).toBe(2);
    // usage is summed across both calls
    expect(result.usage.inputTokens).toBe(20);
  });

  it('throws AI_INVALID_OUTPUT after the repair also fails', async () => {
    const guard = new SchemaGuard();
    await expect(
      guard.run(provider([{ value: 'bad' }, { value: 'still-bad' }]), request, schema),
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });
});
