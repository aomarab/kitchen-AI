import {
  CREDIT_COST_BASIS_USD,
  CREDIT_COSTS,
  creditActionSchema,
  type CreditAction,
} from '@kitchen/contracts';

/**
 * The subset of a `CreditBalance` the gating maths needs. Kept structural so
 * callers can pass the full balance from the API or a hand-built pair, and so
 * these helpers stay pure and node-testable without the query layer.
 */
export interface BalanceLike {
  freeBalance: number;
  paidBalance: number;
}

export interface InsufficientCreditsDetails {
  action: CreditAction | null;
  required: number | null;
  available: number | null;
  needed: number | null;
}

/**
 * Spendable credits. Free and purchased credits are fungible at spend time, so
 * the total is what an action is checked against; the split only matters for
 * display. `paidBalance` may be negative after a refund of consumed credits, so
 * this can be below `freeBalance` — that is deliberate, never clamped.
 */
export function totalCredits(balance: BalanceLike): number {
  return balance.freeBalance + balance.paidBalance;
}

export function costOf(action: CreditAction): number {
  return CREDIT_COSTS[action];
}

/** True when the combined balance covers the action's price. */
export function canAfford(balance: BalanceLike, action: CreditAction): boolean {
  return totalCredits(balance) >= CREDIT_COSTS[action];
}

/**
 * How many credits short the household is for an action, or 0 when it can
 * afford it. Drives the "you need N more" copy on the out-of-credits state.
 */
export function creditsShort(balance: BalanceLike, action: CreditAction): number {
  return Math.max(0, CREDIT_COSTS[action] - totalCredits(balance));
}

/**
 * The price to show for a credit pack. Prefers the store's own price string,
 * which is already localized to the user's storefront currency (SAR, AED, GBP…)
 * and is the amount they will actually be charged; falls back to the contract's
 * price formatted for the active locale only when the store has none to give
 * (mock mode, offline, or the product missing from the offering).
 *
 * The store string is returned untouched — reformatting or reparsing it would
 * reintroduce the very bug this fixes: showing a price the store never charges.
 */
export function displayPrice(storePrice: string | null, fallbackPrice: string): string {
  return storePrice ?? fallbackPrice;
}

export function creditBalanceAccessibilityLabel(label: string, totalLine: string): string {
  return `${label}: ${totalLine}`;
}

/**
 * The legacy usage route reports provider spend in USD. Credits are the unit a
 * household understands, so the mobile usage surface converts that spend back
 * through the same basis the credit contract uses.
 */
export function usageCreditsFromUsd(spentUsd: number): number {
  return Math.round((spentUsd / CREDIT_COST_BASIS_USD) * 100) / 100;
}

export function usageCreditsForDisplay(credits: number): number {
  return Math.round(credits);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function insufficientCreditsDetails(error: unknown): InsufficientCreditsDetails {
  const details =
    isRecord(error) && isRecord(error.details) ? error.details : isRecord(error) ? error : null;
  const action = creditActionSchema.safeParse(details?.action).data ?? null;
  const required = finiteNumber(details?.required);
  const available = finiteNumber(details?.available) ?? finiteNumber(details?.balance);
  const needed = required !== null && available !== null ? Math.max(0, required - available) : null;

  return { action, required, available, needed };
}
