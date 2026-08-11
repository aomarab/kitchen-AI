import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  CREDIT_COSTS,
  FREE_MONTHLY_GRANT,
  type CreditAction,
  type CreditBalance,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { creditLedger, householdCredits } from '../db/schema.js';
import { AppError } from '../common/errors.js';

/** The transaction-scoped client Drizzle hands to a `db.transaction()` callback. */
type TxClient = Parameters<Parameters<Database['transaction']>[0]>[0];

/** `YYYY-MM` in UTC — the month a free balance belongs to. */
export function currentGrantPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Household credit balances (spec §4, §5).
 *
 * Two buckets: a free grant that resets each calendar month, and a purchased
 * balance that never expires because Apple Guideline 3.1.1 forbids it. Free is
 * always spent first, so a light user never touches what they paid for.
 */
@Injectable()
export class CreditsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async balance(householdId: string): Promise<CreditBalance> {
    const row = await this.db.transaction((tx) => this.ensureRow(tx, householdId));
    return {
      householdId,
      freeBalance: row.freeBalance,
      paidBalance: row.paidBalance,
      grantPeriod: row.grantPeriod,
      freeGrant: FREE_MONTHLY_GRANT,
    };
  }

  /**
   * Throw INSUFFICIENT_CREDITS if the household cannot currently afford
   * `action`, without moving anything.
   */
  async assertCanAfford(householdId: string, action: CreditAction): Promise<void> {
    const row = await this.db.transaction((tx) => this.ensureRow(tx, householdId));
    if (row.freeBalance + row.paidBalance < CREDIT_COSTS[action]) {
      throw new AppError('INSUFFICIENT_CREDITS', 'errors.INSUFFICIENT_CREDITS', {
        action,
        required: CREDIT_COSTS[action],
        available: row.freeBalance + row.paidBalance,
      });
    }
  }

  /**
   * Debit `action`'s price, free bucket first.
   *
   * `ensureRow` holds FOR UPDATE on the balance row for the duration of this
   * transaction. That lock is required — not optional — for split correctness:
   * without it two concurrent spends could read the same balances, compute the
   * same split, and then both pass the WHERE guard (free + paid >= cost) while
   * one of them drives freeBalance negative.
   */
  async spend(
    householdId: string,
    action: CreditAction,
    opts: { aiUsageId?: string } = {},
  ): Promise<void> {
    const cost = CREDIT_COSTS[action];

    await this.db.transaction(async (tx) => {
      const row = await this.ensureRow(tx, householdId);

      const fromFree = Math.min(Math.max(row.freeBalance, 0), cost);
      const fromPaid = cost - fromFree;

      // Single conditional UPDATE — zero affected rows means insufficient funds.
      // The guard matches assertCanAfford: total balance, not per-bucket, so a
      // negative paidBalance with a healthy freeBalance still allows spending.
      const [updated] = await tx
        .update(householdCredits)
        .set({
          freeBalance: sql`${householdCredits.freeBalance} - ${fromFree}`,
          paidBalance: sql`${householdCredits.paidBalance} - ${fromPaid}`,
          updatedAt: new Date(),
        })
        .where(
          sql`${householdCredits.householdId} = ${householdId}
              and ${householdCredits.freeBalance} + ${householdCredits.paidBalance} >= ${cost}`,
        )
        .returning({ householdId: householdCredits.householdId });

      if (!updated) {
        throw new AppError('INSUFFICIENT_CREDITS', 'errors.INSUFFICIENT_CREDITS', {
          required: cost,
          balance: row.freeBalance + row.paidBalance,
        });
      }

      // Correlate the 1–2 ledger rows so refund can reverse exactly this spend.
      const spendGroupId = crypto.randomUUID();
      const rows = [];
      if (fromFree > 0) {
        rows.push({
          householdId,
          delta: -fromFree,
          kind: 'spend' as const,
          bucket: 'free',
          action,
          spendGroupId,
          ...(opts.aiUsageId ? { aiUsageId: opts.aiUsageId } : {}),
        });
      }
      if (fromPaid > 0) {
        rows.push({
          householdId,
          delta: -fromPaid,
          kind: 'spend' as const,
          bucket: 'paid',
          action,
          spendGroupId,
          ...(opts.aiUsageId ? { aiUsageId: opts.aiUsageId } : {}),
        });
      }
      if (rows.length > 0) await tx.insert(creditLedger).values(rows);
    });
  }

  /**
   * Return an action's price after the work failed.
   *
   * Finds the most-recent unreversed spend group for this action and reverses
   * it exactly — same buckets, same amounts — so the household gets back what
   * it actually paid, never more. A reversal row is always written for the
   * target group so `refund` stays idempotent: a second call sees the group as
   * already reversed and is a no-op. Spend rows are never mutated (append-only).
   */
  async refund(householdId: string, action: CreditAction): Promise<void> {
    await this.db.transaction(async (tx) => {
      const currentRow = await this.ensureRow(tx, householdId);

      // Collect spend-group ids that already have a reversal row.
      const reversedGroups = await tx
        .select({ spendGroupId: creditLedger.spendGroupId })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.householdId, householdId),
            eq(creditLedger.kind, 'reversal'),
            eq(creditLedger.action, action),
          ),
        );
      const reversedIds = new Set(reversedGroups.map((r) => r.spendGroupId).filter(Boolean));

      // Fetch all spend rows for this action to find the most-recent unreversed group.
      const spendRows = await tx
        .select({
          spendGroupId: creditLedger.spendGroupId,
          delta: creditLedger.delta,
          bucket: creditLedger.bucket,
          createdAt: creditLedger.createdAt,
        })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.householdId, householdId),
            eq(creditLedger.kind, 'spend'),
            eq(creditLedger.action, action),
          ),
        );

      // Group by spendGroupId, skipping already-reversed groups.
      const groups = new Map<string, { rows: typeof spendRows; newestAt: Date }>();
      for (const r of spendRows) {
        if (!r.spendGroupId || reversedIds.has(r.spendGroupId)) continue;
        const entry = groups.get(r.spendGroupId);
        if (!entry) {
          groups.set(r.spendGroupId, { rows: [r], newestAt: r.createdAt });
        } else {
          entry.rows.push(r);
          if (r.createdAt > entry.newestAt) entry.newestAt = r.createdAt;
        }
      }

      if (groups.size === 0) return; // Nothing to reverse.

      // Pick the most-recent group. Tie-break on spendGroupId (stable sort) so
      // concurrent spends that land in the same millisecond are deterministic.
      const [targetGroupId, target] = [...groups.entries()].sort((a, b) => {
        const dt = b[1].newestAt.getTime() - a[1].newestAt.getTime();
        return dt !== 0 ? dt : b[0].localeCompare(a[0]);
      })[0]!;

      let toFree = 0;
      let toPaid = 0;
      for (const r of target.rows) {
        if (r.bucket === 'free') toFree += Math.abs(r.delta);
        else toPaid += Math.abs(r.delta);
      }

      // Cap the free refund so freeBalance cannot exceed FREE_MONTHLY_GRANT.
      // Floor at 0: if currentFree > FREE_MONTHLY_GRANT the unclamped value
      // would be negative, which would subtract credits on a refund.
      // Any clamped-off free amount is NOT redirected to paid — the original
      // spend came from free, and we cannot conjure paid credits.
      const cappedToFree = Math.max(
        0,
        Math.min(toFree, FREE_MONTHLY_GRANT - currentRow.freeBalance),
      );

      if (cappedToFree > 0 || toPaid > 0) {
        await tx
          .update(householdCredits)
          .set({
            freeBalance: sql`${householdCredits.freeBalance} + ${cappedToFree}`,
            paidBalance: sql`${householdCredits.paidBalance} + ${toPaid}`,
            updatedAt: new Date(),
          })
          .where(eq(householdCredits.householdId, householdId));
      }

      // Always write the reversal row(s) so the group is marked reversed even
      // when the clamp reduces the credit amount to 0.  Without this, a
      // clamped no-op refund leaves the group unreversed and a second call
      // re-targets it — silently failing to credit the household forever.
      const reversalRows = [];
      if (cappedToFree > 0) {
        reversalRows.push({
          householdId,
          delta: cappedToFree,
          kind: 'reversal' as const,
          bucket: 'free',
          action,
          spendGroupId: targetGroupId,
        });
      }
      if (toPaid > 0) {
        reversalRows.push({
          householdId,
          delta: toPaid,
          kind: 'reversal' as const,
          bucket: 'paid',
          action,
          spendGroupId: targetGroupId,
        });
      }
      // Sentinel row: marks the group reversed when both amounts were clamped to 0.
      if (reversalRows.length === 0) {
        reversalRows.push({
          householdId,
          delta: 0,
          kind: 'reversal' as const,
          bucket: 'free',
          action,
          spendGroupId: targetGroupId,
        });
      }
      await tx.insert(creditLedger).values(reversalRows);
    });
  }

  /** Add purchased credits. `credits` may be negative for a refunded purchase. */
  async grantPurchase(
    householdId: string,
    credits: number,
    purchaseId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.ensureRow(tx, householdId);
      await tx
        .update(householdCredits)
        .set({
          paidBalance: sql`${householdCredits.paidBalance} + ${credits}`,
          updatedAt: new Date(),
        })
        .where(eq(householdCredits.householdId, householdId));

      await tx.insert(creditLedger).values({
        householdId,
        delta: credits,
        kind: credits >= 0 ? ('purchase' as const) : ('refund' as const),
        bucket: 'paid',
        ...(purchaseId ? { purchaseId } : {}),
      });
    });
  }

  /**
   * Read the balance row, creating it or rolling the monthly grant over as
   * needed, and acquire FOR UPDATE for the rest of the transaction.
   *
   * The lock is REQUIRED for split correctness in `spend`. Without it, two
   * concurrent transactions read the same (free, paid) values, compute the same
   * split, and then both pass the `free + paid >= cost` WHERE guard — one of
   * them drives freeBalance negative. The lock serialises the reads so each
   * transaction sees the balance after the previous one commits.
   */
  private async ensureRow(
    tx: TxClient,
    householdId: string,
  ): Promise<{
    freeBalance: number;
    paidBalance: number;
    grantPeriod: string;
  }> {
    const period = currentGrantPeriod();

    const inserted = await tx
      .insert(householdCredits)
      .values({
        householdId,
        freeBalance: FREE_MONTHLY_GRANT,
        paidBalance: 0,
        grantPeriod: period,
      })
      .onConflictDoNothing()
      .returning({ householdId: householdCredits.householdId });

    // `returning` yields a row only when the INSERT actually succeeded —
    // the opening grant lands exactly once even if two first reads race.
    if (inserted.length > 0) {
      await tx.insert(creditLedger).values({
        householdId,
        delta: FREE_MONTHLY_GRANT,
        kind: 'grant' as const,
        bucket: 'free',
      });
    }

    const locked = await tx.execute(
      sql`select free_balance, paid_balance, grant_period
          from household_credits
          where household_id = ${householdId}
          for update`,
    );
    const row = locked[0] as
      { free_balance: number; paid_balance: number; grant_period: string } | undefined;
    if (!row) throw new AppError('INTERNAL_ERROR', 'errors.INTERNAL_ERROR');

    if (row.grant_period !== period) {
      await tx
        .update(householdCredits)
        .set({
          freeBalance: FREE_MONTHLY_GRANT,
          grantPeriod: period,
          updatedAt: new Date(),
        })
        .where(eq(householdCredits.householdId, householdId));
      await tx.insert(creditLedger).values({
        householdId,
        delta: FREE_MONTHLY_GRANT,
        kind: 'grant' as const,
        bucket: 'free',
      });
      return {
        freeBalance: FREE_MONTHLY_GRANT,
        paidBalance: row.paid_balance,
        grantPeriod: period,
      };
    }

    return {
      freeBalance: row.free_balance,
      paidBalance: row.paid_balance,
      grantPeriod: row.grant_period,
    };
  }
}
