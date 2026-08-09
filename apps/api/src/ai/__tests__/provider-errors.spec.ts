import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../../common/errors.js';
import { withTransientRetry, isTransientAiError } from '../planner/transient-retry.js';
import { toProviderError } from '../providers/openai.provider.js';

const noSleep = () => Promise.resolve();

/**
 * These three units exist because of what a real weekly plan did, not because
 * of a design. Each test below is a run that actually happened.
 */
describe('transient retry', () => {
  it('retries a group that never landed rather than losing the whole plan', async () => {
    // Observed: a weekly plan is 8 provider calls; the 8th hit `Connection
    // error` and threw away 7 successful groups that had already been billed.
    let calls = 0;
    const run = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE');
      return 'plan';
    });

    await expect(withTransientRetry(run, { retries: 2, sleep: noSleep })).resolves.toBe('plan');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['AI_INVALID_OUTPUT', 'a completion that failed validation will fail again'],
    ['QUOTA_EXCEEDED', 'an exhausted budget stays exhausted'],
    ['EXTERNAL_SERVICE_ERROR', 'a rejected request shape is our bug, not an outage'],
    ['RATE_LIMITED', 'the SDK already backed off; retrying here compounds it'],
  ] as const)('does not retry %s — %s', async (code, _why) => {
    const run = vi.fn(async () => {
      throw new AppError(code, `errors.${code}`);
    });

    await expect(withTransientRetry(run, { retries: 3, sleep: noSleep })).rejects.toMatchObject({
      code,
    });
    // The point of the narrow condition: exactly one full-priced attempt.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured retries and rethrows the last error', async () => {
    const run = vi.fn(async () => {
      throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE', { attempt: 'last' });
    });

    await expect(withTransientRetry(run, { retries: 2, sleep: noSleep })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      details: { attempt: 'last' },
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially and does not sleep after the final attempt', async () => {
    const slept: number[] = [];
    const run = async () => {
      throw new AppError('AI_UNAVAILABLE', 'errors.AI_UNAVAILABLE');
    };

    await expect(
      withTransientRetry(run, {
        retries: 2,
        sleep: async (ms) => {
          slept.push(ms);
        },
      }),
    ).rejects.toThrow();

    expect(slept).toEqual([1_000, 2_000]);
  });

  it('does not retry a non-AppError throw', async () => {
    const run = vi.fn(async () => {
      throw new TypeError('bug in our own mapping code');
    });

    await expect(withTransientRetry(run, { retries: 3, sleep: noSleep })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(isTransientAiError(new TypeError('x'))).toBe(false);
  });
});

describe('toProviderError', () => {
  it('maps a timeout to AI_UNAVAILABLE so the group is retried', () => {
    // Observed: a 61k-token weekly call timed out at 120s. OpenAI still
    // generated (and still billed); the socket just never delivered.
    const err = toProviderError(
      Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }),
      'plan',
      'gpt-5',
    ) as AppError;

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(isTransientAiError(err)).toBe(true);
    expect(String(err.details?.reason)).toContain('APIConnectionTimeoutError');
  });

  it('maps 429 to RATE_LIMITED, not to a generic outage', () => {
    const err = toProviderError(
      Object.assign(new Error('Rate limit reached'), { status: 429 }),
      'plan',
      'gpt-5',
    ) as AppError;

    expect(err.code).toBe('RATE_LIMITED');
    expect(isTransientAiError(err)).toBe(false);
  });

  it('maps a 400 to EXTERNAL_SERVICE_ERROR and keeps the reason for diagnosis', () => {
    // This is the exact 400 that made every real AI call fail before the
    // `max_completion_tokens` fix. Retrying it would only buy the same 400.
    const err = toProviderError(
      Object.assign(
        new Error("Unsupported parameter: 'max_tokens' is not supported with this model."),
        { status: 400 },
      ),
      'plan',
      'gpt-5-2025-08-07',
    ) as AppError;

    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(isTransientAiError(err)).toBe(false);
    expect(err.details).toMatchObject({ status: 400, model: 'gpt-5-2025-08-07' });
    expect(String(err.details?.reason)).toContain('max_tokens');
  });

  it('treats 5xx as transient', () => {
    const err = toProviderError(
      Object.assign(new Error('Bad gateway'), { status: 502 }),
      'plan',
      'gpt-5',
    ) as AppError;

    expect(err.code).toBe('AI_UNAVAILABLE');
  });

  it('passes an AppError through untouched', () => {
    const original = new AppError('AI_INVALID_OUTPUT', 'errors.AI_INVALID_OUTPUT');
    expect(toProviderError(original, 'plan', 'gpt-5')).toBe(original);
  });
});
