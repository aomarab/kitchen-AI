import { api } from './api';
import { purchases as defaultPort, isCancelled, type PurchasesPort } from './purchases';

export type PurchaseOutcome =
  { status: 'credited' } | { status: 'pending' } | { status: 'cancelled' };

/**
 * Buy a credit pack (spec §6).
 *
 * The intent is created *before* the store sheet opens, so a webhook-first
 * delivery can still resolve the household. After the store charges the card the
 * only remaining step is our `confirmPurchase`; if that call fails the outcome
 * is `pending`, never an error — the RevenueCat webhook is the backstop and both
 * paths are idempotent server-side. Telling a paying customer their purchase
 * failed when the charge succeeded is the worst outcome in this flow.
 *
 * The store port is injected so the flow is unit-testable and so mock mode never
 * loads the native SDK.
 */
export async function buyCredits(
  productId: string,
  port: PurchasesPort = defaultPort,
): Promise<PurchaseOutcome> {
  const intent = await api.call('createPurchaseIntent', { body: { productId } });

  const result = await port.purchase(productId, intent.intentId);
  if (isCancelled(result)) return { status: 'cancelled' };
  // The store returned without a transaction id: the charge is unconfirmed, so
  // let the webhook finish it rather than claiming success.
  if (!result.storeTransactionId) return { status: 'pending' };

  try {
    await api.call('confirmPurchase', {
      body: {
        intentId: intent.intentId,
        storeTransactionId: result.storeTransactionId,
        store: result.store,
      },
    });
    return { status: 'credited' };
  } catch {
    // The charge succeeded; only our confirmation did not land.
    return { status: 'pending' };
  }
}
