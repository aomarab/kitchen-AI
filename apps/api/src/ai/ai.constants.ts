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
  // Planning generates a full week of meals in one response.
  planning: 120_000,
};

/** Retries inside the SDK, on top of which nothing else retries. */
export const PROVIDER_MAX_RETRIES = 2;

export const PROVIDER_MAX_OUTPUT_TOKENS: Record<ModelTier, number> = {
  cheap: 2_048,
  vision: 4_096,
  planning: 8_192,
};
