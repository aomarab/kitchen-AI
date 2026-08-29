import { AppError } from '../common/errors.js';
import type { PaymentVerifier, VerifiedPurchase } from './payment-verifier.js';

const REVENUECAT_BASE_URL = 'https://api.revenuecat.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;

interface RevenueCatSubscriber {
  subscriber?: {
    non_subscriptions?: Record<string, { id?: string; store_transaction_id?: string }[]>;
  };
}

/**
 * Real store-receipt verification via RevenueCat's REST API. Selected only when
 * `env.PAYMENTS_MOCK` is false, mirroring the AI providers behind `AI_MOCK`.
 *
 * A purchase is trusted only when RevenueCat both answers 2xx *and* reports the
 * transaction under the expected product id. Anything else is not-valid: a
 * non-2xx is raised as `EXTERNAL_SERVICE_ERROR` rather than being parsed as
 * success (so a transport hiccup can never be mistaken for a paid receipt), and
 * a mismatched product id returns `valid: false` so the caller refuses it.
 *
 * The subscriber is looked up by RevenueCat *app user id* — which the client
 * sets to the purchase intent id before checkout — because that, not the store
 * transaction id, is what keys a customer's receipts (spec §6.2). The security
 * contract — never grant on an unverified receipt — does not depend on that
 * detail.
 */
export class RevenueCatVerifier implements PaymentVerifier {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = REVENUECAT_BASE_URL,
  ) {}

  async verify(
    appUserId: string,
    storeTransactionId: string,
    productId: string,
  ): Promise<VerifiedPurchase> {
    const url = `${this.baseUrl}/subscribers/${encodeURIComponent(appUserId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError('EXTERNAL_SERVICE_ERROR', 'errors.EXTERNAL_SERVICE_ERROR', {
        provider: 'revenuecat',
        reason: error instanceof Error ? error.message : 'request failed',
      });
    }

    if (!response.ok) {
      throw new AppError('EXTERNAL_SERVICE_ERROR', 'errors.EXTERNAL_SERVICE_ERROR', {
        provider: 'revenuecat',
        status: response.status,
      });
    }

    const body = (await response.json().catch(() => ({}))) as RevenueCatSubscriber;
    const purchases = Object.values(body.subscriber?.non_subscriptions ?? {}).flat();
    const matched = purchases.some(
      (p) => p.store_transaction_id === storeTransactionId || p.id === storeTransactionId,
    );
    const productMatches = productId in (body.subscriber?.non_subscriptions ?? {});

    return { storeTransactionId, productId, valid: matched && productMatches };
  }
}
