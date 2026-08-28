import { Inject, Injectable } from '@nestjs/common';
import {
  CREDIT_COSTS,
  creditActionSchema,
  type CreditAction,
  type CreditCalibration,
  type CreditCalibrationRow,
  type CreditCalibrationStatus,
} from '@kitchen/contracts';
import { CREDIT_COST_BASIS_USD, creditRevenueUsd } from '../realtime-cost.js';
import { toIso } from '../../common/serialization.js';
import { ActionCostQuery, type ActionCostRow } from './action-cost.query.js';

/** Round to `dp` decimals; USD costs here run to fractions of a cent. */
function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Actions whose cost can never be read from `ai_usage`.
 *
 * `assistant.session` is charged when a realtime client secret is minted, but
 * the audio it pays for is billed by the provider per minute over a peer
 * connection the server never sees. It will always measure zero calls, so it is
 * reported as `unmeasured` rather than folded into the covered/underpriced
 * judgement — the alternative reads a feature we cannot see as free.
 */
export const UNMEASURABLE_ACTIONS: ReadonlySet<CreditAction> = new Set<CreditAction>([
  'assistant.session',
]);

/** Order rows worst-margin-and-most-material first. */
const STATUS_RANK: Record<CreditCalibrationStatus, number> = {
  underpriced: 0,
  covered: 1,
  unmeasured: 2,
  unused: 3,
};

/**
 * Turn the two measured ledgers into a per-action margin report.
 *
 * Pure so the judgement — what counts as underpriced, how the window is
 * scanned, why `assistant.session` is never "covered" — is unit-tested without
 * a database. `costBasisUsd` is the number every price in `CREDIT_COSTS` was
 * divided from, so dividing a measured USD cost back by it yields the credits
 * that action *should* list; comparing that to what it *does* list is the whole
 * question this surface answers.
 */
export function deriveCalibration(measured: ActionCostRow[], since: Date): CreditCalibration {
  const costBasisUsd = CREDIT_COST_BASIS_USD;
  const creditValueUsd = creditRevenueUsd();
  const byAction = new Map(measured.map((row) => [row.action, row]));

  const rows: CreditCalibrationRow[] = creditActionSchema.options.map((action) => {
    const m = byAction.get(action);
    const measurable = !UNMEASURABLE_ACTIONS.has(action);
    const chargedCount = m?.chargedCount ?? 0;
    const measuredCount = m?.measuredCount ?? 0;
    const measuredCostUsd = m?.costUsd ?? 0;

    // Average cost of one charge, expressed in the credits it should have cost.
    // Left unrounded here so the status boundary is decided before display
    // rounding can nudge a value across it.
    const perCharge = measuredCount > 0 ? measuredCostUsd / measuredCount / costBasisUsd : null;

    let status: CreditCalibrationStatus;
    if (chargedCount === 0) {
      status = 'unused';
    } else if (!measurable || measuredCount === 0) {
      status = 'unmeasured';
    } else if (perCharge! > CREDIT_COSTS[action]) {
      status = 'underpriced';
    } else {
      status = 'covered';
    }

    return {
      action,
      listedCredits: CREDIT_COSTS[action],
      chargedCount,
      measuredCount,
      callCount: m?.callCount ?? 0,
      creditsCharged: m?.creditsCharged ?? 0,
      measuredCostUsd: round(measuredCostUsd, 4),
      measuredCreditsPerCharge: perCharge === null ? null : round(perCharge, 3),
      measurable,
      status,
    };
  });

  rows.sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return rank !== 0 ? rank : b.measuredCostUsd - a.measuredCostUsd;
  });

  return {
    since: toIso(since),
    costBasisUsd,
    creditValueUsd,
    rows,
  };
}

@Injectable()
export class CreditCalibrationService {
  constructor(@Inject(ActionCostQuery) private readonly costs: ActionCostQuery) {}

  async calibrate(days: number): Promise<CreditCalibration> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const measured = await this.costs.byCreditAction({ since });
    return deriveCalibration(measured, since);
  }
}
