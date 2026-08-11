/**
 * Dependency-injection tokens, queue names and cost tables for the AI
 * workstream. Kept in one place so the module wiring and the services agree on
 * the same symbols.
 */

export const AI_PROVIDER = Symbol('AI_PROVIDER');
export const YOUTUBE_CLIENT = Symbol('YOUTUBE_CLIENT');
export const OPEN_FOOD_FACTS_CLIENT = Symbol('OPEN_FOOD_FACTS_CLIENT');
export const RESPONSE_CACHE = Symbol('RESPONSE_CACHE');
export const CATALOG_PORT = Symbol('CATALOG_PORT');
export const EMBEDDINGS_PORT = Symbol('EMBEDDINGS_PORT');
export const USAGE_REPOSITORY = Symbol('USAGE_REPOSITORY');
export const PANTRY_PORT = Symbol('PANTRY_PORT');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const JOB_STORE = Symbol('JOB_STORE');

/** BullMQ queue names. Mirrors the `jobs.type` enum in the contract. */
export const QUEUE_PLAN = 'plan.generate';
export const QUEUE_RECEIPT = 'receipt.parse';
export const QUEUE_VIDEO = 'video.fetch';

/**
 * Every distinct model interaction. Drives which model tier is used, how usage
 * is logged, and which fixture the mock provider returns.
 */
export type AiOperation =
  | 'vision.recognize'
  | 'receipt.extract'
  | 'receipt.map'
  | 'name.resolve'
  | 'plan.generate'
  | 'recipe.translate';

/** Which model tier an operation runs on. See spec §5.6 (cost controls). */
export type ModelTier = 'cheap' | 'vision' | 'planning';

export const OPERATION_TIER: Record<AiOperation, ModelTier> = {
  'vision.recognize': 'vision',
  'receipt.extract': 'vision',
  'receipt.map': 'cheap',
  'name.resolve': 'cheap',
  'plan.generate': 'planning',
  'recipe.translate': 'cheap',
};

export interface ModelRate {
  input: number;
  output: number;
}

/**
 * USD per 1M tokens, keyed by the concrete model id the provider reports.
 *
 * Keyed by model rather than by tier because two vendors can serve one tier:
 * billing a Gemini vision call at OpenAI's rate would misstate spend in
 * `ai_usage`, and that ledger is what AI credit pricing is derived from.
 *
 * List prices as of 2026-08-11. Verify before launch; these move.
 */
export const MODEL_RATES_USD_PER_MTOK: Record<string, ModelRate> = {
  'gpt-5': { input: 2.5, output: 10 },
  'gpt-5-mini': { input: 0.15, output: 0.6 },
  'gemini-3-flash': { input: 1.5, output: 7.5 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

/**
 * Used only when a model id is not in the table above — a newly configured
 * model, or a provider reporting a dated id like `gpt-5-2026-01-01`. It keeps
 * billing conservative rather than free, but it is a fallback, not a plan:
 * an unknown model priced silently at a default is how spend drifts unnoticed,
 * so it warns.
 */
export const TIER_FALLBACK_RATES: Record<ModelTier, ModelRate> = {
  cheap: { input: 0.15, output: 0.6 },
  vision: { input: 2.5, output: 10 },
  planning: { input: 2.5, output: 10 },
};

export function estimateCostUsd(
  model: string,
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  let rate = MODEL_RATES_USD_PER_MTOK[model];
  if (!rate) {
    rate = TIER_FALLBACK_RATES[tier];
    console.warn(
      `[ai] no rate for model "${model}" (tier ${tier}); billing at the tier fallback rate. ` +
        'Add it to MODEL_RATES_USD_PER_MTOK.',
    );
  }
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

/** Videos are cached for 30 days (spec §5.5). */
export const VIDEO_CACHE_TTL_DAYS = 30;

/**
 * Hard limits on a single provider call.
 *
 * The OpenAI SDK defaults to a 10-minute timeout and 2 retries, so one wedged
 * upstream request can hold a Nest request — and the user's HTTP connection —
 * for half an hour. Nothing above this layer imposes a deadline, so it has to
 * be imposed here.
 *
 * `maxOutputTokens` bounds the other side of the same problem: an unbounded
 * completion is an unbounded bill, and a household's daily budget is only
 * checked *before* a call, never mid-stream.
 */
export const PROVIDER_TIMEOUT_MS: Record<ModelTier, number> = {
  cheap: 30_000,
  vision: 60_000,
  // A generation group is at most MAX_RECIPES_PER_GENERATION recipes, measured
  // at ~70s for three against real gpt-5. This is headroom over that, not room
  // for a whole week — asking for a week is what made this time out before.
  planning: 180_000,
};

/**
 * Retries inside the SDK, on top of which nothing else retries.
 *
 * Planning gets fewer: its calls are the expensive ones, and a timeout there
 * is usually deterministic (too much asked for) rather than transient, so the
 * SDK's retry just re-buys the same failure. Worse, a timed-out call still
 * generated tokens we are billed for but never see a usage record for, so each
 * retry is invisible spend.
 */
export const PROVIDER_MAX_RETRIES: Record<ModelTier, number> = {
  cheap: 2,
  vision: 2,
  planning: 1,
};

/**
 * Ceilings, not targets. A weekly plan is one call covering 21 meal slots, each
 * a full recipe with ingredients, steps and nutrition — a measured worst case
 * is ~8k tokens in English and denser in Arabic. On top of that the GPT-5
 * family bills *reasoning* tokens against this same ceiling without emitting
 * them, so the visible-output headroom is well below the number here. Since
 * hitting the ceiling is now a hard failure rather than a degraded response,
 * these are set with room to spare; the daily budget, not this, is the cost
 * control.
 */
export const PROVIDER_MAX_OUTPUT_TOKENS: Record<ModelTier, number> = {
  cheap: 4_096,
  vision: 8_192,
  // Real gpt-5 spends ~2.9k output tokens per generated recipe (reasoning
  // tokens included, which are billed against this same ceiling). A group is
  // bounded at MAX_RECIPES_PER_GENERATION, so this is roughly double the
  // measured worst case.
  planning: 16_000,
};
