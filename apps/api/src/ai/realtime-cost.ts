import { CREDIT_COSTS, CREDIT_PACKS } from '@kitchen/contracts';

/**
 * What a live assistant session actually costs, and what that means for its
 * price (spec §3, and the kitchen companion spec's Feature 5).
 *
 * This file exists because `assistant.session` is the one credit price that
 * cannot be measured from our own `ai_usage` ledger. Realtime audio is billed
 * by the provider per minute of conversation over a peer connection we never
 * see, so the price was set from an estimate written in a comment. An estimate
 * in a comment cannot go stale loudly: rates move, and nothing fails.
 *
 * So the estimate is written here as arithmetic instead, with its inputs named
 * and its conclusions asserted in `realtime-cost.spec.ts`. When a rate changes,
 * the test that fails tells you which conclusion changed with it.
 */

/**
 * Published gpt-realtime audio rates, USD per 1M tokens.
 *
 * Audio is priced separately from — and far above — text on this model, which
 * is the whole reason the assistant needs its own cost model rather than
 * reusing `MODEL_RATES_USD_PER_MTOK`.
 *
 * List prices as of 2026-08-28. Verify before launch; these move.
 */
export const REALTIME_AUDIO_USD_PER_MTOK = {
  input: 32,
  output: 64,
  /** Replayed conversation context, ~80x cheaper than fresh input. */
  cachedInput: 0.4,
} as const;

/**
 * How much audio one minute of speech is worth in tokens.
 *
 * The two directions are *not* the same, which is the single most important
 * fact in this file: output audio is tokenized at twice the rate of input
 * (one token per 50ms against one per 100ms) and priced at twice as much per
 * token. A minute of the assistant talking therefore costs almost exactly four
 * times a minute of the user talking, so the cost of a session is dominated by
 * how much *it* says, not how long the user holds the button.
 */
export const REALTIME_AUDIO_TOKENS_PER_MIN = {
  input: 600,
  output: 1200,
} as const;

/**
 * The session `assistant.session` is priced for.
 *
 * A two-minute exchange where the assistant speaks half the time: the user
 * walks to the fridge, asks what to cook, and is answered. Longer sessions are
 * under-charged and that is accepted — see {@link assistantBreakEvenMinutes}
 * for the point where it stops being acceptable.
 */
export const ASSISTANT_SESSION_SHAPE = {
  minutes: 2,
  /** Share of wall-clock time the assistant is the one speaking. */
  assistantSpeechShare: 0.5,
  /**
   * Instructions plus the pantry brief, re-read on every turn. Cached after the
   * first read, so this is charged at the cached rate and is a rounding error
   * next to the audio — it is modelled only so that it is visibly a rounding
   * error rather than silently omitted.
   */
  contextTokens: 1500,
  turnsPerMinute: 3,
} as const;

/** USD of model cost for a conversation of `minutes`, at the shape above. */
export function estimateAssistantSessionUsd(minutes: number): number {
  const { assistantSpeechShare, contextTokens, turnsPerMinute } = ASSISTANT_SESSION_SHAPE;

  const assistantMinutes = minutes * assistantSpeechShare;
  const userMinutes = minutes * (1 - assistantSpeechShare);

  const outputTokens = assistantMinutes * REALTIME_AUDIO_TOKENS_PER_MIN.output;
  const inputTokens = userMinutes * REALTIME_AUDIO_TOKENS_PER_MIN.input;
  // Every turn re-reads the instructions and the pantry brief.
  const cachedTokens = contextTokens * turnsPerMinute * minutes;

  return (
    (outputTokens * REALTIME_AUDIO_USD_PER_MTOK.output +
      inputTokens * REALTIME_AUDIO_USD_PER_MTOK.input +
      cachedTokens * REALTIME_AUDIO_USD_PER_MTOK.cachedInput) /
    1_000_000
  );
}

/**
 * What one credit sells for, from the only pack we actually list.
 *
 * This is *revenue*, not cost. It is the ceiling a session may cost before it
 * loses money outright, which is a different and much later threshold than the
 * cost basis the price was set from.
 */
export function creditRevenueUsd(): number {
  const pack = CREDIT_PACKS[0];
  if (!pack) throw new Error('no credit pack to price against');
  return pack.priceUsd / pack.credits;
}

/**
 * The internal cost basis the credit table was built on: one credit is roughly
 * this much model cost. Every other price in `CREDIT_COSTS` is a measured
 * action cost divided by this number.
 */
export const CREDIT_COST_BASIS_USD = 0.0045;

/**
 * How long a session can run before its charge stops covering it.
 *
 * `basis: 'revenue'` is the point where the session costs more than the credits
 * it consumed were sold for — past here, the feature loses money on every extra
 * minute. `basis: 'cost'` uses the internal cost basis the whole credit table
 * was built on, and is therefore the duration `assistant.session` was priced
 * *for* rather than the point of loss.
 */
export function assistantBreakEvenMinutes(basis: 'revenue' | 'cost'): number {
  const budget =
    CREDIT_COSTS['assistant.session'] *
    (basis === 'revenue' ? creditRevenueUsd() : CREDIT_COST_BASIS_USD);
  // The estimate is linear in `minutes`, so one evaluation gives the slope.
  const perMinute = estimateAssistantSessionUsd(1);
  return budget / perMinute;
}
