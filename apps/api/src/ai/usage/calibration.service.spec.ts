import { describe, expect, it } from 'vitest';
import { CREDIT_COSTS, creditActionSchema } from '@kitchen/contracts';
import { CREDIT_COST_BASIS_USD, creditRevenueUsd } from '../realtime-cost.js';
import type { ActionCostRow } from './action-cost.query.js';
import { deriveCalibration } from './calibration.service.js';

/**
 * Build a measured row whose average cost lands at `perCharge` credits, so a
 * test can name the price it wants and let the arithmetic follow. `costUsd`
 * is the total across `charges`, which is what the query actually returns.
 */
function measured(
  action: ActionCostRow['action'],
  perChargeCredits: number,
  charges: number,
): ActionCostRow {
  return {
    action,
    chargedCount: charges,
    creditsCharged: CREDIT_COSTS[action] * charges,
    measuredCount: charges,
    callCount: charges * 2,
    costUsd: perChargeCredits * CREDIT_COST_BASIS_USD * charges,
  };
}

describe('deriveCalibration', () => {
  const since = new Date('2026-08-01T00:00:00.000Z');

  it('classifies each action by measured cost against its listed price', () => {
    const result = deriveCalibration(
      [
        measured('pantry.scan', 0.8, 10), // under the listed 1 → covered
        measured('receipt.scan', 2.5, 4), // over the listed 2 → underpriced
        measured('plan.daily', 4, 2), // exactly the listed 4 → covered, not underpriced
        // Charged but nothing measured, yet measurable: every call failed
        // before the vendor billed. Not "covered" — we have no cost for it.
        { ...measured('plan.weekly', 0, 3), measuredCount: 0, callCount: 0, costUsd: 0 },
      ],
      since,
    );

    const row = (action: string) => result.rows.find((r) => r.action === action)!;

    expect(row('pantry.scan')).toMatchObject({ status: 'covered', measuredCreditsPerCharge: 0.8 });
    expect(row('receipt.scan')).toMatchObject({
      status: 'underpriced',
      measuredCreditsPerCharge: 2.5,
    });
    expect(row('plan.daily').status).toBe('covered');
    expect(row('plan.weekly')).toMatchObject({
      status: 'unmeasured',
      measuredCreditsPerCharge: null,
    });
    // Never charged in the window at all.
    expect(row('plan.monthly')).toMatchObject({ status: 'unused', chargedCount: 0 });
  });

  it('never reports assistant.session as covered, even when charged', () => {
    const result = deriveCalibration(
      [{ ...measured('assistant.session', 0, 5), measuredCount: 0, callCount: 0, costUsd: 0 }],
      since,
    );
    const row = result.rows.find((r) => r.action === 'assistant.session')!;
    expect(row.measurable).toBe(false);
    expect(row.status).toBe('unmeasured');
    expect(row.measuredCreditsPerCharge).toBeNull();
  });

  it('lists every credit action exactly once', () => {
    const result = deriveCalibration([], since);
    expect(result.rows.map((r) => r.action).sort()).toEqual([...creditActionSchema.options].sort());
  });

  it('orders underpriced first, then covered by cost, then unmeasured, then unused', () => {
    const result = deriveCalibration(
      [
        measured('pantry.scan', 0.5, 100), // covered, larger total cost
        measured('plan.regenerateEntry', 0.5, 1), // covered, tiny total cost
        measured('receipt.scan', 3, 4), // underpriced
      ],
      since,
    );
    const statuses = result.rows.map((r) => r.status);
    // Underpriced leads.
    expect(statuses[0]).toBe('underpriced');
    // The two covered rows are sorted by measured cost, larger first.
    const covered = result.rows.filter((r) => r.status === 'covered').map((r) => r.action);
    expect(covered.slice(0, 2)).toEqual(['pantry.scan', 'plan.regenerateEntry']);
    // Unused sinks to the bottom.
    expect(result.rows.at(-1)!.status).toBe('unused');
  });

  it('reports the cost basis and credit sale value the whole table is priced from', () => {
    const result = deriveCalibration([], since);
    expect(result.costBasisUsd).toBe(CREDIT_COST_BASIS_USD);
    expect(result.creditValueUsd).toBe(creditRevenueUsd());
    expect(result.since).toBe(since.toISOString());
  });
});
