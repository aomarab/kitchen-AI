import { and, eq, gte, isNotNull, inArray, sql } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { CreditAction } from '@kitchen/contracts';
import { DB, type Database } from '../../db/index.js';
import { aiUsage, creditLedger } from '../../db/schema.js';

/**
 * What one credit action actually cost, measured rather than modelled.
 */
export interface ActionCostRow {
  action: CreditAction;
  /** Spend groups charged for this action in the window. */
  chargedCount: number;
  /** Net credits taken, refunds already subtracted. */
  creditsCharged: number;
  /**
   * Spend groups that produced at least one `ai_usage` row.
   *
   * Reported separately from {@link chargedCount} because the two differing is
   * information, not noise: `assistant.session` will always measure zero, since
   * realtime audio is billed by the provider over a connection the server never
   * sees. A surface that divided cost by charges alone would report that
   * feature as free.
   */
  measuredCount: number;
  /** Vendor calls attributed to this action. */
  callCount: number;
  /** USD the vendor charged us for those calls. */
  costUsd: number;
}

/**
 * Answers "are we covering costs?" from the two ledgers we already keep.
 *
 * Deliberately not part of the narrow {@link UsageRepository} port: that port
 * exists so `BudgetService` can run against an in-memory fake, and this is a
 * reporting query with no place in the hot path of a model call.
 *
 * The join key is `spend_group_id`, written on the credit ledger by
 * `CreditsService.spend` and on `ai_usage` by `BudgetService.record` while a
 * billing context is active. One action is many calls, so the aggregation is
 * done in two passes: charges from the ledger and cost from usage. Summing both
 * in a single join would multiply every usage row by the 1–2 ledger rows a
 * split spend writes.
 */
@Injectable()
export class ActionCostQuery {
  constructor(@Inject(DB) private readonly db: Database) {}

  async byCreditAction(opts: {
    since: Date;
    /** Narrow to one household — for diagnosing a specific bill. */
    householdId?: string;
  }): Promise<ActionCostRow[]> {
    const scope = (column: typeof creditLedger.householdId) =>
      opts.householdId ? eq(column, opts.householdId) : undefined;

    // Charges, netted against refunds: a reversal is a positive delta in the
    // same group, so summing both kinds leaves what the household actually paid.
    const charges = await this.db
      .select({
        action: creditLedger.action,
        credits: sql<string>`-coalesce(sum(${creditLedger.delta}), 0)`,
        groups: sql<string>`count(distinct ${creditLedger.spendGroupId})`,
      })
      .from(creditLedger)
      .where(
        and(
          inArray(creditLedger.kind, ['spend', 'reversal']),
          isNotNull(creditLedger.action),
          gte(creditLedger.createdAt, opts.since),
          scope(creditLedger.householdId),
        ),
      )
      .groupBy(creditLedger.action);

    // `selectDistinct` collapses the 1–2 ledger rows of a split spend to one
    // row per group before the join, which is what keeps the cost sum honest.
    const groups = this.db.$with('groups').as(
      this.db
        .selectDistinct({
          spendGroupId: creditLedger.spendGroupId,
          action: creditLedger.action,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.kind, 'spend'),
            isNotNull(creditLedger.action),
            isNotNull(creditLedger.spendGroupId),
            gte(creditLedger.createdAt, opts.since),
            scope(creditLedger.householdId),
          ),
        ),
    );

    const costs = await this.db
      .with(groups)
      .select({
        action: groups.action,
        cost: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
        calls: sql<string>`count(*)`,
        measured: sql<string>`count(distinct ${aiUsage.spendGroupId})`,
      })
      .from(aiUsage)
      .innerJoin(groups, eq(groups.spendGroupId, aiUsage.spendGroupId))
      .groupBy(groups.action);

    const costByAction = new Map(costs.map((row) => [row.action, row]));

    return charges
      .filter((row): row is typeof row & { action: string } => row.action !== null)
      .map((row) => {
        const measured = costByAction.get(row.action);
        return {
          action: row.action as CreditAction,
          chargedCount: Number(row.groups),
          creditsCharged: Number(row.credits),
          measuredCount: Number(measured?.measured ?? 0),
          callCount: Number(measured?.calls ?? 0),
          costUsd: Number(measured?.cost ?? 0),
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);
  }
}
