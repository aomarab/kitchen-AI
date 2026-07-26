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
 */
export interface AiSpend {
  usage: TokenUsage;
  model: string;
}

const SPEND = Symbol.for('kitchen.ai.spend');

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

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}
