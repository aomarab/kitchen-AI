import type { TokenUsage } from './providers/ai-provider.interface.js';

/**
 * Tokens are billed the moment the provider answers, whether or not the answer
 * was usable. Two paths throw *after* spending: a truncated completion, and a
 * repair attempt that still fails validation (two full calls). Neither reached
 * `BudgetService.record`, so the most expensive outcomes were the only ones
 * that never counted against the daily cap — a household whose requests
 * reliably failed could spend without limit.
 *
 * A thrown error therefore carries whatever was already spent, and the gateway
 * records it before rethrowing.
 *
 * Two distinct channels ride on thrown errors:
 *
 * - `spend` (via attachSpend/readSpend): what the *throwing* call itself
 *   billed — a single vendor, a single model id, a single usage sum.
 *
 * - `priorAttempts` (via attachPriorAttempts/readPriorAttempts): what
 *   *earlier, superseded* calls billed at possibly different rates. These
 *   cannot be merged into `spend` because two vendors bill per-token at
 *   different prices — summing them would misprice both.
 */
export interface AiSpend {
  usage: TokenUsage;
  model: string;
}

const SPEND = Symbol.for('kitchen.ai.spend');
const PRIOR_ATTEMPTS = Symbol.for('kitchen.ai.priorAttempts');

export function attachSpend<E extends object>(error: E, spend: AiSpend): E {
  Object.defineProperty(error, SPEND, {
    value: spend,
    enumerable: false,
    configurable: true,
  });
  return error;
}

export function readSpend(error: unknown): AiSpend | null {
  if (typeof error !== 'object' || error === null) return null;
  const spend = (error as Record<symbol, unknown>)[SPEND];
  return (spend as AiSpend | undefined) ?? null;
}

export function attachPriorAttempts<E extends object>(error: E, attempts: AiSpend[]): E {
  Object.defineProperty(error, PRIOR_ATTEMPTS, {
    value: attempts,
    enumerable: false,
    configurable: true,
  });
  return error;
}

export function readPriorAttempts(error: unknown): AiSpend[] {
  if (typeof error !== 'object' || error === null) return [];
  const attempts = (error as Record<symbol, unknown>)[PRIOR_ATTEMPTS];
  return (attempts as AiSpend[] | undefined) ?? [];
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}
