import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

/**
 * Billable user-facing actions. Credits are priced per *action*, not per AI
 * call: one plan is several gateway calls and is discarded whole if any of them
 * fails, so per-call billing would charge for work that was thrown away.
 *
 * `name.resolve` and `recipe.translate` are deliberately absent — they are
 * internal steps absorbed by the action that triggered them.
 */
export const creditActionSchema = z.enum([
  'pantry.scan',
  'receipt.scan',
  'plan.daily',
  'plan.weekly',
  'plan.monthly',
  'plan.regenerateEntry',
  'assistant.session',
]);
export type CreditAction = z.infer<typeof creditActionSchema>;

/**
 * Credits per action. One credit is roughly $0.0045 of model cost, so these
 * track the real cost ratio: a monthly plan costs ~51x a pantry scan, and a
 * flat "one credit per action" price would be insolvent at that spread.
 *
 * See spec §3. Change these only with the cost table in `ai.constants.ts`.
 */
export const CREDIT_COSTS: Record<CreditAction, number> = {
  'pantry.scan': 1,
  'receipt.scan': 2,
  'plan.daily': 4,
  'plan.weekly': 20,
  'plan.monthly': 50,
  'plan.regenerateEntry': 2,
  // Charged when a realtime client secret is minted, because that is the only
  // moment the server sees. Realtime audio is billed by the provider per minute
  // of conversation, which we never observe, so unlike every other action here
  // this price cannot be read back from the `ai_usage` ledger — it is derived
  // from a modelled session instead. That model is arithmetic, not prose: see
  // `apps/api/src/ai/realtime-cost.ts` and the tests beside it, which fail if
  // the rates move far enough to invalidate any conclusion below.
  //
  // As modelled: a 2-minute exchange with the assistant speaking half of it
  // costs ~$0.0996, which is 22.1 credits at the table's $0.0045 basis, rounded
  // up to 25. Two consequences are deliberate and must not be quietly "fixed":
  //   - a long session is under-charged, which is why the client secret's TTL is
  //     at the provider floor (see REALTIME_SECRET_TTL_SEC) — one mint buys one
  //     connection, and staying longer is the only thing we cannot meter. The
  //     charge stops covering its own cost basis at ~2.3 minutes and only loses
  //     money outright past ~8.4, so the exposure is bounded by how rare a
  //     nine-minute conversation with a fridge is, not by an enforcement we have;
  //   - a session abandoned after five seconds is over-charged, so the mint is
  //     refunded when the connection never opens.
  'assistant.session': 25,
};

/**
 * Free credits granted each calendar month. Monthly rather than daily because
 * meal planning is bursty — people plan on Sunday — and a daily drip punishes
 * exactly the behaviour the product encourages.
 */
export const FREE_MONTHLY_GRANT = 150;

export interface CreditPack {
  productId: string;
  credits: number;
  priceUsd: number;
}

/** Store SKUs. `productId` must match the App Store / Play Console product id. */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { productId: 'credits_300', credits: 300, priceUsd: 4.99 },
];

/** `YYYY-MM`; the month a free balance belongs to. */
export const grantPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const creditBalanceSchema = z.object({
  householdId: uuidSchema,
  freeBalance: z.number().int().nonnegative(),
  /** May be negative after a refund of already-consumed credits. */
  paidBalance: z.number().int(),
  grantPeriod: grantPeriodSchema,
  freeGrant: z.number().int().nonnegative(),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

export const purchaseIntentRequestSchema = z.object({
  productId: z.string().min(1),
});
export type PurchaseIntentRequest = z.infer<typeof purchaseIntentRequestSchema>;

export const purchaseIntentSchema = z.object({
  intentId: uuidSchema,
  productId: z.string(),
  credits: z.number().int().positive(),
});
export type PurchaseIntent = z.infer<typeof purchaseIntentSchema>;

export const confirmPurchaseRequestSchema = z.object({
  intentId: uuidSchema,
  storeTransactionId: z.string().min(1),
  store: z.enum(['apple', 'google']),
});
export type ConfirmPurchaseRequest = z.infer<typeof confirmPurchaseRequestSchema>;

/* ---------------- Staff calibration ---------------- */

/**
 * "Are we covering costs?" — a staff-only report that reads the price we
 * *charge* for each action back against what the vendor *charged us*, both
 * pulled from ledgers we already keep (`credit_ledger` and `ai_usage`, joined
 * on `spend_group_id`). It exists because `CREDIT_COSTS` was set from
 * one-off cost estimates, and an estimate in a table cannot go stale loudly:
 * vendor rates drift, and nothing fails until the margin is already gone.
 */
export const creditCalibrationQuerySchema = z.object({
  /** Trailing window to measure over. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type CreditCalibrationQuery = z.infer<typeof creditCalibrationQuerySchema>;

/**
 * - `covered` — the measured cost of a charge sits at or under its listed price.
 * - `underpriced` — a charge costs more than we sell it for; the margin is gone.
 * - `unmeasured` — charged but no vendor cost was recorded. Either the action is
 *   unmeasurable by construction (`assistant.session`) or every call failed
 *   before the vendor billed. Distinguished from `covered` so a feature we
 *   cannot see never reads as free.
 * - `unused` — nobody ran this action in the window; nothing to judge.
 */
export const creditCalibrationStatusSchema = z.enum([
  'covered',
  'underpriced',
  'unmeasured',
  'unused',
]);
export type CreditCalibrationStatus = z.infer<typeof creditCalibrationStatusSchema>;

export const creditCalibrationRowSchema = z.object({
  action: creditActionSchema,
  /** The listed price from `CREDIT_COSTS`. */
  listedCredits: z.number().int().nonnegative(),
  /** Spend groups charged for this action in the window. */
  chargedCount: z.number().int().nonnegative(),
  /** Spend groups that produced at least one measured vendor call. */
  measuredCount: z.number().int().nonnegative(),
  /** Vendor calls attributed to the action. */
  callCount: z.number().int().nonnegative(),
  /** Net credits taken, refunds already subtracted. */
  creditsCharged: z.number().int(),
  /** USD the vendor charged us across the window. */
  measuredCostUsd: z.number().nonnegative(),
  /**
   * The average measured cost of one charge, expressed in credits at
   * `costBasisUsd`. This is the number to read against `listedCredits`: above
   * it, the action loses money. `null` when nothing was measured.
   */
  measuredCreditsPerCharge: z.number().nullable(),
  /**
   * Whether this action's cost can be read from `ai_usage` at all.
   * `assistant.session` is `false` by construction — realtime audio is billed
   * by the provider over a connection the server never sees.
   */
  measurable: z.boolean(),
  status: creditCalibrationStatusSchema,
});
export type CreditCalibrationRow = z.infer<typeof creditCalibrationRowSchema>;

export const creditCalibrationSchema = z.object({
  /** Start of the measured window (inclusive), ISO-8601. */
  since: isoDateTimeSchema,
  /** The internal cost basis the credit table was priced from, USD per credit. */
  costBasisUsd: z.number().positive(),
  /** What one credit actually sells for, USD per credit. */
  creditValueUsd: z.number().positive(),
  /** One row per credit action, worst margin first. */
  rows: z.array(creditCalibrationRowSchema),
});
export type CreditCalibration = z.infer<typeof creditCalibrationSchema>;
