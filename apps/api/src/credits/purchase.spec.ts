import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestContext, seedHousehold, seedUser, cleanup } from '../testing/harness.js';
import { creditLedger, creditPurchases } from '../db/schema.js';
import { CreditsService } from './credits.service.js';
import { PurchaseService } from './purchase.service.js';
import { MockPaymentVerifier, type PaymentVerifier } from './payment-verifier.js';

/**
 * Store transaction ids must be unique per run, not per file.
 *
 * `store_transaction_id` is UNIQUE, and a duplicate is deliberately swallowed
 * as "already credited" — that is the production behaviour these tests exist to
 * pin. So a fixed id left behind by an interrupted run (afterAll never reached)
 * makes every later run credit nothing and fail, forever, until someone deletes
 * the row by hand. The failure looks like a broken service rather than dirty
 * state, which is what makes it expensive. Reuse *within* a test still means
 * "the same purchase arriving twice"; only the run is namespaced.
 */
const RUN = randomUUID().slice(0, 8);
const txn = (name: string) => `txn-${name}-${RUN}`;
const paymentsEnabledEnv = { NODE_ENV: 'test' as const, PAYMENTS_DISABLED: false };
const paymentsDisabledEnv = { NODE_ENV: 'test' as const, PAYMENTS_DISABLED: true };
const productionPaymentsEnv = { NODE_ENV: 'production' as const, PAYMENTS_DISABLED: false };
const developmentPaymentsEnv = { NODE_ENV: 'development' as const, PAYMENTS_DISABLED: false };

const ctx = createTestContext();
const createdHouseholds: string[] = [];
const createdUsers: string[] = [];
let userId: string;
let householdId: string;
let credits: CreditsService;
let purchases: PurchaseService;

beforeEach(async () => {
  userId = await seedUser(ctx.db);
  householdId = await seedHousehold(ctx.db, userId);
  createdUsers.push(userId);
  createdHouseholds.push(householdId);
  credits = new CreditsService(ctx.db);
  purchases = new PurchaseService(ctx.db, credits, new MockPaymentVerifier(), paymentsEnabledEnv);
});

afterAll(async () => {
  await cleanup(ctx.db, { households: createdHouseholds, users: createdUsers });
  await ctx.client.end();
});

describe('PurchaseService', () => {
  it('credits a confirmed purchase once', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const balance = await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: txn('1'),
      store: 'apple',
    });
    expect(balance.paidBalance).toBe(300);
  });

  it('lands purchased credits in the paid bucket, not the free grant', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const balance = await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: txn('bucket'),
      store: 'apple',
    });
    // Purchased credits must never expire, so they are the paid bucket only.
    expect(balance.paidBalance).toBe(300);
    expect(balance.freeBalance).toBe(balance.freeGrant);

    const purchaseRows = await ctx.db
      .select({ bucket: creditLedger.bucket })
      .from(creditLedger)
      .where(and(eq(creditLedger.householdId, householdId), eq(creditLedger.kind, 'purchase')));
    expect(purchaseRows.length).toBeGreaterThan(0);
    for (const row of purchaseRows) {
      expect(row.bucket).toBe('paid');
    }
  });

  it('is idempotent when the same transaction arrives twice', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: txn('2'),
      store: 'apple',
    });
    await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: txn('2'),
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it('rejects purchase intent creation when payments are disabled', async () => {
    const disabledPurchases = new PurchaseService(
      ctx.db,
      credits,
      new MockPaymentVerifier(),
      paymentsDisabledEnv,
    );

    await expect(
      disabledPurchases.createIntent(householdId, userId, 'credits_300'),
    ).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      messageKey: 'errors.PAYMENTS_DISABLED',
    });
  });

  it('rejects purchase confirmation when payments are disabled', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const disabledPurchases = new PurchaseService(
      ctx.db,
      credits,
      new MockPaymentVerifier(),
      paymentsDisabledEnv,
    );

    await expect(
      disabledPurchases.confirm(householdId, {
        intentId: intent.intentId,
        storeTransactionId: txn('disabled-confirm'),
        store: 'apple',
      }),
    ).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      messageKey: 'errors.PAYMENTS_DISABLED',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(0);
  });

  it('acknowledges but does not credit webhook purchases when payments are disabled', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const disabledPurchases = new PurchaseService(
      ctx.db,
      credits,
      new MockPaymentVerifier(),
      paymentsDisabledEnv,
    );

    await disabledPurchases.applyWebhook({
      type: 'INITIAL_PURCHASE',
      intentId: intent.intentId,
      storeTransactionId: txn('disabled-webhook'),
      productId: 'credits_300',
      environment: 'PRODUCTION',
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(0);
  });

  it('is idempotent when the webhook races the confirm call', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    await Promise.all([
      purchases.confirm(householdId, {
        intentId: intent.intentId,
        storeTransactionId: txn('3'),
        store: 'apple',
      }),
      purchases.applyWebhook({
        type: 'INITIAL_PURCHASE',
        intentId: intent.intentId,
        storeTransactionId: txn('3'),
        productId: 'credits_300',
        store: 'apple',
      }),
    ]);

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it('is idempotent when the webhook is redelivered', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const event = {
      type: 'INITIAL_PURCHASE',
      intentId: intent.intentId,
      storeTransactionId: txn('redeliver'),
      productId: 'credits_300',
      store: 'apple' as const,
    };
    await purchases.applyWebhook(event);
    await purchases.applyWebhook(event);

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it('does not double-grant when the same transaction reaches two intents', async () => {
    const intentA = await purchases.createIntent(householdId, userId, 'credits_300');
    await purchases.confirm(householdId, {
      intentId: intentA.intentId,
      storeTransactionId: txn('dup'),
      store: 'apple',
    });

    const intentB = await purchases.createIntent(householdId, userId, 'credits_300');
    // Same store transaction id on a *different* intent: the UNIQUE index must
    // refuse the second write, handled as an already-processed no-op — not a 500
    // and not a second grant.
    await purchases.confirm(householdId, {
      intentId: intentB.intentId,
      storeTransactionId: txn('dup'),
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);

    const [rowB] = await ctx.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, intentB.intentId));
    expect(rowB?.status).toBe('pending');
  });

  it('resolves the household from the intent when only the webhook arrives', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    await purchases.applyWebhook({
      type: 'INITIAL_PURCHASE',
      intentId: intent.intentId,
      storeTransactionId: txn('4'),
      productId: 'credits_300',
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it('does not credit a webhook purchase whose product id mismatches the intent', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    await purchases.applyWebhook({
      type: 'INITIAL_PURCHASE',
      intentId: intent.intentId,
      storeTransactionId: txn('product-mismatch'),
      productId: 'credits_100',
      environment: 'PRODUCTION',
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(0);

    const [row] = await ctx.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, intent.intentId));
    expect(row?.status).toBe('pending');
    expect(row?.storeTransactionId).toBeNull();
  });

  it('does not credit a sandbox webhook purchase in production', async () => {
    const productionPurchases = new PurchaseService(
      ctx.db,
      credits,
      new MockPaymentVerifier(),
      productionPaymentsEnv,
    );
    const intent = await productionPurchases.createIntent(householdId, userId, 'credits_300');

    await productionPurchases.applyWebhook({
      type: 'INITIAL_PURCHASE',
      intentId: intent.intentId,
      storeTransactionId: txn('sandbox-prod'),
      productId: 'credits_300',
      environment: 'SANDBOX',
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(0);
  });

  it('credits a sandbox webhook purchase in development', async () => {
    const developmentPurchases = new PurchaseService(
      ctx.db,
      credits,
      new MockPaymentVerifier(),
      developmentPaymentsEnv,
    );
    const intent = await developmentPurchases.createIntent(householdId, userId, 'credits_300');

    await developmentPurchases.applyWebhook({
      type: 'INITIAL_PURCHASE',
      intentId: intent.intentId,
      storeTransactionId: txn('sandbox-dev'),
      productId: 'credits_300',
      environment: 'SANDBOX',
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(300);
  });

  it('grants nothing when verification is rejected', async () => {
    const rejecting: PaymentVerifier = {
      verify: async (_appUserId, storeTransactionId, productId) => ({
        storeTransactionId,
        productId,
        valid: false,
      }),
    };
    const guarded = new PurchaseService(ctx.db, credits, rejecting, paymentsEnabledEnv);
    const intent = await guarded.createIntent(householdId, userId, 'credits_300');

    await expect(
      guarded.confirm(householdId, {
        intentId: intent.intentId,
        storeTransactionId: txn('reject'),
        store: 'apple',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(0);

    const [row] = await ctx.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, intent.intentId));
    // No claim: the intent is still pending and no transaction was stamped.
    expect(row?.status).toBe('pending');
    expect(row?.storeTransactionId).toBeNull();
  });

  it('drives the balance negative when consumed credits are refunded', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    await purchases.confirm(householdId, {
      intentId: intent.intentId,
      storeTransactionId: txn('5'),
      store: 'apple',
    });

    // Drain both buckets, then refund the purchase.
    for (let i = 0; i < 9; i += 1) await credits.spend(householdId, 'plan.monthly');

    await purchases.applyWebhook({
      type: 'CANCELLATION',
      intentId: intent.intentId,
      storeTransactionId: txn('5'),
      productId: 'credits_300',
      store: 'apple',
    });

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBeLessThan(0);

    const [row] = await ctx.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.storeTransactionId, txn('5')));
    expect(row?.status).toBe('refunded');
  });

  it('leaves the purchase re-claimable when crediting crashes mid-confirm', async () => {
    // Simulate a crash or DB blip in the window between the claim and the
    // credit. The claim and the credit share one transaction, so this must roll
    // back to `pending` — never a charged-but-uncredited `active` purchase.
    const flaky = new CreditsService(ctx.db);
    const realGrant = flaky.grantPurchase.bind(flaky);
    let grantCalls = 0;
    const spy = vi
      .spyOn(flaky, 'grantPurchase')
      .mockImplementation(async (hid, credits, purchaseId, tx) => {
        grantCalls += 1;
        if (grantCalls === 1) throw new Error('simulated crash before credit');
        return realGrant(hid, credits, purchaseId, tx);
      });
    const flakyPurchases = new PurchaseService(
      ctx.db,
      flaky,
      new MockPaymentVerifier(),
      paymentsEnabledEnv,
    );

    const intent = await flakyPurchases.createIntent(householdId, userId, 'credits_300');

    await expect(
      flakyPurchases.confirm(householdId, {
        intentId: intent.intentId,
        storeTransactionId: txn('crash'),
        store: 'apple',
      }),
    ).rejects.toThrow(/simulated crash/);

    // The failed confirm granted nothing and left the row claimable.
    const afterCrash = await credits.balance(householdId);
    expect(afterCrash.paidBalance).toBe(0);
    const [rowAfterCrash] = await ctx.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, intent.intentId));
    expect(rowAfterCrash?.status).toBe('pending');

    // RevenueCat redelivers; the retry heals the purchase and credits exactly once.
    await flakyPurchases.applyWebhook({
      type: 'INITIAL_PURCHASE',
      intentId: intent.intentId,
      storeTransactionId: txn('crash'),
      productId: 'credits_300',
      store: 'apple',
    });

    const healed = await credits.balance(householdId);
    expect(healed.paidBalance).toBe(300);
    const [rowHealed] = await ctx.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.id, intent.intentId));
    expect(rowHealed?.status).toBe('active');

    spy.mockRestore();
  });

  it('ignores a webhook whose app_user_id is not one of our intents', async () => {
    // app_user_id doubles as the intent id; an anonymous RevenueCat customer or
    // an event for some other user is a non-uuid we must swallow as a no-op —
    // never a 500 from feeding a bad value to the uuid-typed id column.
    await expect(
      purchases.applyWebhook({
        type: 'INITIAL_PURCHASE',
        intentId: '$RCAnonymousID:deadbeef',
        storeTransactionId: txn('anon'),
        productId: 'credits_300',
        store: 'apple',
      }),
    ).resolves.toBeUndefined();

    const balance = await credits.balance(householdId);
    expect(balance.paidBalance).toBe(0);
  });

  it('rejects an unknown product', async () => {
    await expect(purchases.createIntent(householdId, userId, 'credits_9999')).rejects.toMatchObject(
      {
        code: 'VALIDATION_FAILED',
      },
    );
  });
});
