import { AppError } from '../../common/errors.js';

/**
 * Retries only what is worth retrying.
 *
 * Plan generation is chunked into several provider calls, so a plan is only as
 * reliable as its flakiest group: one dropped connection on the last call of a
 * weekly plan throws away every group before it, and those groups have already
 * been paid for. Retrying the group is far cheaper than retrying the plan.
 *
 * The narrow condition matters as much as the retry. `AI_UNAVAILABLE` is the
 * one code that means "the call never landed" — a timeout, a reset socket, a
 * 5xx. Everything else is deterministic and would fail identically at full
 * price: an invalid completion will be invalid again, a quota that is exhausted
 * stays exhausted, and a rejected request shape is our bug. Those propagate on
 * the first failure.
 */
export function isTransientAiError(error: unknown): boolean {
  return error instanceof AppError && error.code === 'AI_UNAVAILABLE';
}

export interface TransientRetryOptions {
  retries: number;
  /** Injectable for tests; defaults to real timed backoff. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withTransientRetry<T>(
  run: () => Promise<T>,
  opts: TransientRetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isTransientAiError(error)) throw error;
      lastError = error;
      opts.onRetry?.(attempt + 1, error);
      if (attempt < opts.retries) await sleep(1_000 * 2 ** attempt);
    }
  }
  throw lastError;
}
