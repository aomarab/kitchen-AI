import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevenueCatVerifier } from './revenuecat.verifier.js';

const subscriber = (
  productId: string,
  purchase: { id?: string; store_transaction_id?: string; is_sandbox?: boolean },
) => ({
  subscriber: {
    non_subscriptions: {
      [productId]: [purchase],
    },
  },
});

function mockRevenueCatResponse(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

describe('RevenueCatVerifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates a matching production purchase', async () => {
    mockRevenueCatResponse(
      subscriber('credits_300', {
        store_transaction_id: 'txn-happy',
        is_sandbox: false,
      }),
    );

    const verifier = new RevenueCatVerifier('rc-key', 'https://revenuecat.test', 'production');

    await expect(verifier.verify('intent-id', 'txn-happy', 'credits_300')).resolves.toEqual({
      storeTransactionId: 'txn-happy',
      productId: 'credits_300',
      valid: true,
    });
  });

  it('rejects a transaction that belongs to a different product id', async () => {
    mockRevenueCatResponse(
      subscriber('credits_100', {
        store_transaction_id: 'txn-cheaper-product',
        is_sandbox: false,
      }),
    );

    const verifier = new RevenueCatVerifier('rc-key', 'https://revenuecat.test', 'production');

    await expect(
      verifier.verify('intent-id', 'txn-cheaper-product', 'credits_300'),
    ).resolves.toMatchObject({ valid: false });
  });

  it('rejects sandbox purchases in production', async () => {
    mockRevenueCatResponse(
      subscriber('credits_300', {
        store_transaction_id: 'txn-sandbox-prod',
        is_sandbox: true,
      }),
    );

    const verifier = new RevenueCatVerifier('rc-key', 'https://revenuecat.test', 'production');

    await expect(
      verifier.verify('intent-id', 'txn-sandbox-prod', 'credits_300'),
    ).resolves.toMatchObject({ valid: false });
  });

  it('accepts sandbox purchases outside production', async () => {
    mockRevenueCatResponse(
      subscriber('credits_300', {
        store_transaction_id: 'txn-sandbox-dev',
        is_sandbox: true,
      }),
    );

    const verifier = new RevenueCatVerifier('rc-key', 'https://revenuecat.test', 'development');

    await expect(
      verifier.verify('intent-id', 'txn-sandbox-dev', 'credits_300'),
    ).resolves.toMatchObject({ valid: true });
  });
});
