export interface VerifiedPurchase {
  storeTransactionId: string;
  productId: string;
  valid: boolean;
}

/**
 * Port for store receipt verification, so the system runs offline and free with
 * no RevenueCat account — the same shape as the AI providers behind `AI_MOCK`.
 *
 * `appUserId` is the RevenueCat *app user id*, which the client sets to the
 * purchase intent id before checkout (`Purchases.logIn(intentId)`): RevenueCat
 * keys a customer's receipts by app user id, so this — not the transaction id —
 * is how the subscriber lookup finds the purchase (spec §6.2).
 */
export interface PaymentVerifier {
  verify(
    appUserId: string,
    storeTransactionId: string,
    productId: string,
  ): Promise<VerifiedPurchase>;
}

export const PAYMENT_VERIFIER = Symbol('PAYMENT_VERIFIER');

export class MockPaymentVerifier implements PaymentVerifier {
  async verify(
    _appUserId: string,
    storeTransactionId: string,
    productId: string,
  ): Promise<VerifiedPurchase> {
    return { storeTransactionId, productId, valid: true };
  }
}
