import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  CREDIT_PACKS,
  type ConfirmPurchaseRequest,
  type CreditBalance,
  type PurchaseIntent,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { creditPurchases } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { numeric } from '../common/serialization.js';
import { CreditsService } from './credits.service.js';
import { PAYMENT_VERIFIER, type PaymentVerifier } from './payment-verifier.js';

export interface WebhookEvent {
  type: string;
  /**
   * RevenueCat's `app_user_id`, which the client sets to the purchase intent id
   * before checkout — this is how a webhook-first delivery resolves the intent.
   */
  intentId: string;
  /** Absent on the events we ignore (e.g. RevenueCat's TEST ping). */
  storeTransactionId?: string;
  productId?: string;
  store: 'apple' | 'google';
}

const PURCHASE_EVENTS = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE']);
const REFUND_EVENTS = new Set(['CANCELLATION', 'REFUND']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres `unique_violation`; the `store_transaction_id` UNIQUE index fired. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

/**
 * Credit purchases (spec §6).
 *
 * A purchase reaches us twice — once from the client's confirm call and once
 * from the RevenueCat webhook — and webhooks retry. Every crediting path
 * therefore *claims* the pending row with a conditional UPDATE and credits only
 * if it won the claim, so the second arrival is a no-op rather than a doubled
 * balance. The `store_transaction_id` UNIQUE constraint is the final backstop:
 * if the same transaction reaches two *different* intent rows, the second write
 * fails the constraint and is treated as an already-credited no-op, never a 500.
 */
@Injectable()
export class PurchaseService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(PAYMENT_VERIFIER) private readonly verifier: PaymentVerifier,
  ) {}

  /**
   * Record the intent *before* the store sheet opens. A webhook identifies a
   * user, but credits belong to a household and a user may be in several — this
   * row is what lets a webhook-first delivery resolve the right one.
   */
  async createIntent(
    householdId: string,
    userId: string,
    productId: string,
  ): Promise<PurchaseIntent> {
    const pack = CREDIT_PACKS.find((p) => p.productId === productId);
    if (!pack) {
      throw new AppError('VALIDATION_FAILED', 'errors.VALIDATION_FAILED', {
        productId,
      });
    }

    const [row] = await this.db
      .insert(creditPurchases)
      .values({
        householdId,
        userId,
        productId,
        credits: pack.credits,
        priceUsd: numeric(pack.priceUsd),
        status: 'pending',
      })
      .returning({ id: creditPurchases.id });
    if (!row) throw new AppError('INTERNAL_ERROR', 'errors.INTERNAL_ERROR');

    return { intentId: row.id, productId, credits: pack.credits };
  }

  async confirm(householdId: string, body: ConfirmPurchaseRequest): Promise<CreditBalance> {
    const intent = await this.loadIntent(householdId, body.intentId);

    const verified = await this.verifier.verify(
      intent.id,
      body.storeTransactionId,
      intent.productId,
    );
    if (!verified.valid) {
      throw new AppError('VALIDATION_FAILED', 'errors.VALIDATION_FAILED', {
        storeTransactionId: body.storeTransactionId,
      });
    }

    await this.claimAndCredit(
      intent.id,
      intent.householdId,
      intent.credits,
      body.storeTransactionId,
      body.store,
    );
    return this.credits.balance(householdId);
  }

  async applyWebhook(event: WebhookEvent): Promise<void> {
    // `intentId` is RevenueCat's app_user_id; a value that is not one of our
    // intent uuids (an anonymous customer, or an event for some other user) is a
    // safe no-op — and the guard also stops a non-uuid from ever reaching the
    // uuid-typed `id` column, which would otherwise be a 500 that RevenueCat
    // retries forever.
    if (!UUID_RE.test(event.intentId)) return;

    const [intent] = await this.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, event.intentId));
    // An unknown intent is not an error: RevenueCat replays old events.
    if (!intent) return;

    if (PURCHASE_EVENTS.has(event.type)) {
      // A purchase event without a transaction id cannot be credited (the id is
      // the idempotency backstop); treat it as a no-op rather than a bad write.
      if (!event.storeTransactionId) return;
      await this.claimAndCredit(
        intent.id,
        intent.householdId,
        intent.credits,
        event.storeTransactionId,
        event.store,
      );
      return;
    }

    if (REFUND_EVENTS.has(event.type)) {
      // The status flip and the debit share one transaction: a crash between
      // them must not leave a refunded purchase that never debited (or the
      // reverse). Only the first refund event claims `active` → `refunded`, and
      // it may drive the balance negative — the credits are already spent and
      // that is the honest record.
      await this.db.transaction(async (tx) => {
        const claimed = await tx
          .update(creditPurchases)
          .set({ status: 'refunded' })
          .where(and(eq(creditPurchases.id, intent.id), eq(creditPurchases.status, 'active')))
          .returning({ id: creditPurchases.id });

        if (claimed.length === 0) return;
        await this.credits.grantPurchase(intent.householdId, -intent.credits, intent.id, tx);
      });
    }
  }

  /**
   * Move `pending` → `active` and credit only if this call performed the
   * transition, **atomically**. The claim UPDATE and the credit share one
   * transaction, so either the row goes active *and* the credits land, or
   * neither does and the row stays `pending` for the next retry to claim — a
   * crash in between can never leave a customer charged but uncredited.
   *
   * Two concurrent arrivals both reach the UPDATE; exactly one matches
   * `status = 'pending'` and the loser credits nothing. The write also stamps
   * `store_transaction_id`, whose UNIQUE index is the cross-intent backstop: if
   * this transaction was already credited under a *different* intent, the UPDATE
   * raises a unique violation, the transaction rolls back, and we swallow it as
   * an already-processed no-op. A duplicate must be success, never a 500.
   */
  private async claimAndCredit(
    id: string,
    householdId: string,
    credits: number,
    storeTransactionId: string,
    store: 'apple' | 'google',
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const claimed = await tx
          .update(creditPurchases)
          .set({ status: 'active', storeTransactionId, store })
          .where(and(eq(creditPurchases.id, id), eq(creditPurchases.status, 'pending')))
          .returning({ id: creditPurchases.id });

        // Loser of a concurrent or duplicate claim: nothing to credit, commit a
        // clean no-op so the balance is never doubled.
        if (claimed.length === 0) return;
        await this.credits.grantPurchase(householdId, credits, id, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
  }

  private async loadIntent(householdId: string, intentId: string) {
    const [row] = await this.db
      .select()
      .from(creditPurchases)
      .where(and(eq(creditPurchases.id, intentId), eq(creditPurchases.householdId, householdId)));
    if (!row) throw AppError.notFound('errors.NOT_FOUND');
    return row;
  }
}
