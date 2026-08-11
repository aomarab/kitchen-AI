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

/**
 * Approximate USD cost per 1M tokens, used to enforce the per-household daily
 * budget before a call and to record spend afterwards. Values are intentionally
 * conservative; exact billing is not the goal, budget safety is.
 */
export const MODEL_RATES_USD_PER_MTOK: Record<ModelTier, { input: number; output: number }> = {
  cheap: { input: 0.15, output: 0.6 },
  vision: { input: 2.5, output: 10 },
  planning: { input: 2.5, output: 10 },
};

export function estimateCostUsd(
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = MODEL_RATES_USD_PER_MTOK[tier];
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

/**
 * How much the GPT-5 family is asked to *think* before answering, per tier.
 *
 * Reasoning tokens are billed and, more importantly here, waited on: capture is
 * a person standing in front of an open fridge holding their phone, so latency
 * is the whole experience. Measured on a real fridge photo, the default effort
 * spent ~2.2k reasoning tokens and 60s to name what is on the shelves — a
 * perception task where the deliberation buys nothing, because the model either
 * sees the yoghurt or it does not.
 *
 * Planning is the opposite and is deliberately left at the model default: it
 * runs as a background job nobody is watching, and the reasoning is what keeps
 * a plan inside the pantry it was given.
 *
 * `undefined` means "send no parameter", which is also required for non-GPT-5
 * models — they reject it outright.
 */
export const PROVIDER_REASONING_EFFORT: Record<ModelTier, 'low' | 'medium' | 'high' | undefined> = {
  cheap: 'low',
  vision: 'low',
  planning: undefined,
};
