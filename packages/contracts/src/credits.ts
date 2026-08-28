import { z } from 'zod';
import { uuidSchema } from './common.js';

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
