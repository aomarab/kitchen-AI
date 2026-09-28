const CREDIT_COST_BASIS_USD = 0.0045;

/**
 * The legacy usage route still reports vendor spend in USD. The mobile surface
 * presents the same spend back in credits so users never see model-cost dollars.
 */
export function usageCreditsFromUsd(spentUsd: number): number {
  return Math.round((spentUsd / CREDIT_COST_BASIS_USD) * 100) / 100;
}
