import { describe, expect, it, vi } from 'vitest';
import { OpenAiProvider } from '../providers/openai.provider.js';
import { SchemaGuard } from '../validation/schema-guard.js';
import { readSpend } from '../ai-spend.js';
import { PROVIDER_MAX_OUTPUT_TOKENS } from '../ai.constants.js';
import type { AiProvider, StructuredRequest } from '../providers/ai-provider.interface.js';
import { z } from 'zod';
import { AiGateway } from '../ai-gateway.service.js';
import { attachSpend } from '../ai-spend.js';

function providerWith(
  create: ReturnType<typeof vi.fn>,
  models = {
    cheap: 'gpt-5-mini',
    vision: 'gpt-5',
    planning: 'gpt-5',
  },
) {
  const provider = new OpenAiProvider('sk-test', models);
  // Replace the SDK client; nothing here should reach the network.
  (provider as unknown as { client: unknown }).client = {
    chat: { completions: { create } },
  };
  return provider;
}

function request(overrides: Partial<StructuredRequest> = {}): StructuredRequest {
  return {
    operation: 'plan.generate',
    tier: 'planning',
    system: 'system',
    user: 'user',
    ...overrides,
  } as StructuredRequest;
}

function completion(overrides: Record<string, unknown> = {}) {
  return {
    choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
    usage: { prompt_tokens: 100, completion_tokens: 200 },
    model: 'gpt-5',
    ...overrides,
  };
}

describe('OpenAiProvider token-limit parameter', () => {
  /**
   * The GPT-5 and o-series families reject `max_tokens` with a 400 that the SDK
   * does not retry, so sending it would have failed *every* real AI call —
   * invisible under AI_MOCK, and invisible to tsc because the SDK types still
   * carry the deprecated field.
   */
  it('sends max_completion_tokens to the gpt-5 family, never max_tokens', async () => {
    const create = vi.fn().mockResolvedValue(completion());
    await providerWith(create).complete(request());

    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.max_completion_tokens).toBe(PROVIDER_MAX_OUTPUT_TOKENS.planning);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('sends max_tokens to models that predate the change', async () => {
    const create = vi.fn().mockResolvedValue(completion({ model: 'gpt-4o' }));
    const provider = providerWith(create, {
      cheap: 'gpt-4o-mini',
      vision: 'gpt-4o',
      planning: 'gpt-4o',
    });
    await provider.complete(request());

    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.max_tokens).toBe(PROVIDER_MAX_OUTPUT_TOKENS.planning);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });
});

describe('billed-but-failed calls', () => {
  /**
   * Tokens are charged when the provider answers, not when the answer is
   * usable. Both failure paths throw after spending, and neither reached the
   * budget ledger — so the most expensive outcomes were the only ones that
   * never counted against the daily cap.
   */
  it('carries the spend on a truncation error', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(
        completion({ choices: [{ finish_reason: 'length', message: { content: '{"par' } }] }),
      );

    const error = await providerWith(create)
      .complete(request())
      .catch((e: unknown) => e);

    const spend = readSpend(error);
    expect(spend).not.toBeNull();
    expect(spend?.usage).toEqual({ inputTokens: 100, outputTokens: 200 });
  });

  it('carries both calls after a failed repair attempt', async () => {
    const provider: AiProvider = {
      kind: 'openai',
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          raw: { wrong: true },
          usage: { inputTokens: 10, outputTokens: 20 },
          model: 'gpt-5',
        })
        .mockResolvedValueOnce({
          raw: { still: 'wrong' },
          usage: { inputTokens: 30, outputTokens: 40 },
          model: 'gpt-5',
        }),
    };

    const error = await new SchemaGuard()
      .run(provider, request(), z.object({ ok: z.literal(true) }))
      .catch((e: unknown) => e);

    expect(readSpend(error)?.usage).toEqual({ inputTokens: 40, outputTokens: 60 });
  });

  it('carries the first call when the repair attempt itself throws', async () => {
    const provider: AiProvider = {
      kind: 'openai',
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          raw: { wrong: true },
          usage: { inputTokens: 10, outputTokens: 20 },
          model: 'gpt-5',
        })
        .mockRejectedValueOnce(new Error('network')),
    };

    const error = await new SchemaGuard()
      .run(provider, request(), z.object({ ok: z.literal(true) }))
      .catch((e: unknown) => e);

    expect(readSpend(error)?.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });
});

describe('AiGateway budget accounting', () => {
  it('records a failed call against the household budget before rethrowing', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const budget = { assertWithinBudget: vi.fn().mockResolvedValue(undefined), record };
    const guard = {
      run: vi.fn().mockRejectedValue(
        attachSpend(new Error('truncated'), {
          usage: { inputTokens: 500, outputTokens: 8000 },
          model: 'gpt-5',
        }),
      ),
    };

    const gateway = new AiGateway(
      { kind: 'openai', complete: vi.fn() },
      guard as never,
      budget as never,
    );

    await expect(
      gateway.execute({
        householdId: 'hh',
        operation: 'plan.generate',
        prompt: { system: 's', user: 'u', version: 'v1' },
        schema: z.unknown(),
      }),
    ).rejects.toThrow('truncated');

    // Without this a household whose requests reliably fail spends real money
    // while `todaySpendUsd` stays at zero, so the daily cap never trips.
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0]).toMatchObject({
      householdId: 'hh',
      usage: { inputTokens: 500, outputTokens: 8000 },
    });
  });
});

describe('OpenAiProvider reasoning effort', () => {
  /**
   * Capture is someone standing at an open fridge: the default reasoning budget
   * put ~60s between the shutter and the review screen on a real photo, which
   * the client gave up waiting for while the server finished and billed the
   * work anyway.
   */
  it('asks the vision tier to think briefly, so capture stays interactive', async () => {
    const create = vi.fn().mockResolvedValue(completion());
    await providerWith(create).complete(request({ tier: 'vision', operation: 'vision.recognize' }));

    expect((create.mock.calls[0]![0] as Record<string, unknown>).reasoning_effort).toBe('low');
  });

  /**
   * Planning is a background job nobody watches, and the reasoning is what
   * keeps a generated plan inside the pantry it was given — so it must keep
   * the model default rather than inherit capture's latency trade.
   */
  it('leaves planning at the model default', async () => {
    const create = vi.fn().mockResolvedValue(completion());
    await providerWith(create).complete(request());

    expect(create.mock.calls[0]![0]).not.toHaveProperty('reasoning_effort');
  });

  /**
   * Non-reasoning models reject the parameter outright with a 400 the SDK does
   * not retry — the same failure mode as `max_tokens`, and equally invisible
   * under AI_MOCK. `OPENAI_MODEL_VISION` is configurable, so this is reachable
   * by configuration alone.
   */
  it('never sends it to a model that would reject it', async () => {
    const create = vi.fn().mockResolvedValue(completion({ model: 'gpt-4o' }));
    await providerWith(create, { cheap: 'gpt-4o', vision: 'gpt-4o', planning: 'gpt-4o' }).complete(
      request({ tier: 'vision', operation: 'vision.recognize' }),
    );

    expect(create.mock.calls[0]![0]).not.toHaveProperty('reasoning_effort');
  });
});
