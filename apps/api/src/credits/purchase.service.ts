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
  intentId: string;
  storeTransactionId: string;
  productId: string;
  store: 'apple' | 'google';
}

const PURCHASE_EVENTS = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE']);
const REFUND_EVENTS = new Set(['CANCELLATION', 'REFUND']);

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

    const verified = await this.verifier.verify(body.storeTransactionId, intent.productId);
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
    const [intent] = await this.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, event.intentId));
    // An unknown intent is not an error: RevenueCat replays old events.
    if (!intent) return;

    if (PURCHASE_EVENTS.has(event.type)) {
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
      const claimed = await this.db
        .update(creditPurchases)
        .set({ status: 'refunded' })
        .where(and(eq(creditPurchases.id, intent.id), eq(creditPurchases.status, 'active')))
        .returning({ id: creditPurchases.id });

      // Only the first refund event debits, and it may drive the balance
      // negative — the credits are already spent and that is the honest record.
      if (claimed.length > 0) {
        await this.credits.grantPurchase(intent.householdId, -intent.credits, intent.id);
      }
    }
  }

  /**
   * Move `pending` → `active` and credit only if this call performed the
   * transition. Two concurrent arrivals both reach the UPDATE; exactly one
   * matches `status = 'pending'` and the loser credits nothing.
   *
   * The write also stamps `store_transaction_id`, whose UNIQUE index is the
   * cross-intent backstop: if this transaction was already credited under a
   * *different* intent, the UPDATE raises a unique violation, which we swallow
   * as an already-processed no-op. A duplicate must be success, never a 500.
   */
  private async claimAndCredit(
    id: string,
    householdId: string,
    credits: number,
    storeTransactionId: string,
    store: 'apple' | 'google',
  ): Promise<void> {
    let claimed: { id: string }[];
    try {
      claimed = await this.db
        .update(creditPurchases)
        .set({ status: 'active', storeTransactionId, store })
        .where(and(eq(creditPurchases.id, id), eq(creditPurchases.status, 'pending')))
        .returning({ id: creditPurchases.id });
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }

    if (claimed.length === 0) return;
    await this.credits.grantPurchase(householdId, credits, id);
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
