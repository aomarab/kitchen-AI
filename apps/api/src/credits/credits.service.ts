import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
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
   * The debit is a single conditional UPDATE rather than a read-then-write:
   * two household members tapping "generate" at once must not both pass a check
   * against a balance that only covers one.
   */
  async spend(
    householdId: string,
    action: CreditAction,
    opts: { aiUsageId?: string } = {},
  ): Promise<void> {
    const cost = CREDIT_COSTS[action];

    await this.db.transaction(async (tx) => {
      const row = await this.ensureRow(tx, householdId);

      const fromFree = Math.min(row.freeBalance, cost);
      const fromPaid = cost - fromFree;

      const [updated] = await tx
        .update(householdCredits)
        .set({
          freeBalance: sql`${householdCredits.freeBalance} - ${fromFree}`,
          paidBalance: sql`${householdCredits.paidBalance} - ${fromPaid}`,
          updatedAt: new Date(),
        })
        .where(
          sql`${householdCredits.householdId} = ${householdId}
              and ${householdCredits.freeBalance} >= ${fromFree}
              and ${householdCredits.paidBalance} >= ${fromPaid}`,
        )
        .returning({ householdId: householdCredits.householdId });

      if (!updated) {
        throw new AppError('INSUFFICIENT_CREDITS', 'errors.INSUFFICIENT_CREDITS', {
          required: cost,
          balance: row.freeBalance + row.paidBalance,
        });
      }

      const rows = [];
      if (fromFree > 0) {
        rows.push({
          householdId,
          delta: -fromFree,
          kind: 'spend' as const,
          bucket: 'free',
          action,
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
          ...(opts.aiUsageId ? { aiUsageId: opts.aiUsageId } : {}),
        });
      }
      if (rows.length > 0) await tx.insert(creditLedger).values(rows);
    });
  }

  /**
   * Return an action's price after the work failed. Refunds to the same bucket
   * the spend came from by reading the most recent spend ledger rows for this
   * action. Falls back to free-first if no spend rows are found.
   */
  async refund(householdId: string, action: CreditAction): Promise<void> {
    const amount = CREDIT_COSTS[action];

    await this.db.transaction(async (tx) => {
      await this.ensureRow(tx, householdId);

      // Find the most recent spend rows for this action to determine bucket split.
      const spendRows = await tx
        .select({ delta: creditLedger.delta, bucket: creditLedger.bucket })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.householdId, householdId),
            eq(creditLedger.kind, 'spend'),
            eq(creditLedger.action, action),
          ),
        )
        .orderBy(desc(creditLedger.createdAt))
        .limit(2);

      // Reconstruct how much came from each bucket during the spend.
      let toFree = 0;
      let toPaid = 0;
      if (spendRows.length > 0) {
        for (const r of spendRows) {
          if (r.bucket === 'free') toFree += Math.abs(r.delta);
          else toPaid += Math.abs(r.delta);
        }
      } else {
        // No spend rows found — refund free-first as a safe default.
        toFree = amount;
      }

      await tx
        .update(householdCredits)
        .set({
          freeBalance: sql`${householdCredits.freeBalance} + ${toFree}`,
          paidBalance: sql`${householdCredits.paidBalance} + ${toPaid}`,
          updatedAt: new Date(),
        })
        .where(eq(householdCredits.householdId, householdId));

      const rows = [];
      if (toFree > 0) {
        rows.push({
          householdId,
          delta: toFree,
          kind: 'reversal' as const,
          bucket: 'free',
          action,
        });
      }
      if (toPaid > 0) {
        rows.push({
          householdId,
          delta: toPaid,
          kind: 'reversal' as const,
          bucket: 'paid',
          action,
        });
      }
      if (rows.length > 0) await tx.insert(creditLedger).values(rows);
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
   * needed, and lock it for the rest of the transaction.
   *
   * `FOR UPDATE` serialises concurrent spends: without it two transactions
   * read the same balance and both believe they can afford it.
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
