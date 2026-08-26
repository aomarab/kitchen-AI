export interface VerifiedPurchase {
  storeTransactionId: string;
  productId: string;
  valid: boolean;
}

/**
 * Port for store receipt verification, so the system runs offline and free with
 * no RevenueCat account — the same shape as the AI providers behind `AI_MOCK`.
 */
export interface PaymentVerifier {
  verify(storeTransactionId: string, productId: string): Promise<VerifiedPurchase>;
}

export const PAYMENT_VERIFIER = Symbol('PAYMENT_VERIFIER');

export class MockPaymentVerifier implements PaymentVerifier {
  async verify(storeTransactionId: string, productId: string): Promise<VerifiedPurchase> {
    return { storeTransactionId, productId, valid: true };
  }
}
