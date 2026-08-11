import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseResult, PurchasesPort } from './purchases';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const call = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ api: { call } }));

import { buyCredits } from './purchase';

const INTENT = {
  intentId: '00000000-0000-4000-8000-000000000001',
  productId: 'credits_300',
  credits: 300,
};

function port(result: PurchaseResult | (() => Promise<PurchaseResult>)): PurchasesPort {
  return {
    purchase: vi.fn(async () => (typeof result === 'function' ? result() : result)),
  };
}

describe('buyCredits', () => {
  beforeEach(() => {
    call.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('creates the intent before opening the store sheet', async () => {
    call.mockResolvedValueOnce(INTENT).mockResolvedValueOnce({});
    const storePort = port({ storeTransactionId: 'txn-9', store: 'apple' });

    await buyCredits('credits_300', storePort);

    // Intent first, purchase second — the order the webhook backstop depends on.
    expect(call).toHaveBeenNthCalledWith(1, 'createPurchaseIntent', {
      body: { productId: 'credits_300' },
    });
    expect(storePort.purchase).toHaveBeenCalledWith('credits_300');
  });

  it('confirms with the store transaction id and returns credited', async () => {
    call.mockResolvedValueOnce(INTENT).mockResolvedValueOnce({});
    const storePort = port({ storeTransactionId: 'txn-42', store: 'google' });

    const outcome = await buyCredits('credits_300', storePort);

    expect(outcome).toEqual({ status: 'credited' });
    expect(call).toHaveBeenNthCalledWith(2, 'confirmPurchase', {
      body: { intentId: INTENT.intentId, storeTransactionId: 'txn-42', store: 'google' },
    });
  });

  it('returns cancelled and never confirms when the user backs out', async () => {
    call.mockResolvedValueOnce(INTENT);
    const storePort = port({ cancelled: true });

    const outcome = await buyCredits('credits_300', storePort);

    expect(outcome).toEqual({ status: 'cancelled' });
    // Only the intent call happened; no confirmation for an abandoned sheet.
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalledWith('confirmPurchase', expect.anything());
  });

  it('returns pending — not an error — when the store gives no transaction id', async () => {
    call.mockResolvedValueOnce(INTENT);
    const storePort = port({ storeTransactionId: '', store: 'apple' });

    const outcome = await buyCredits('credits_300', storePort);

    expect(outcome).toEqual({ status: 'pending' });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('returns pending when confirm fails after a successful charge', async () => {
    // Intent ok, store charged, but our confirm call throws: the money moved, so
    // the user must never see an error — the webhook finishes it.
    call.mockResolvedValueOnce(INTENT).mockRejectedValueOnce(new Error('network'));
    const storePort = port({ storeTransactionId: 'txn-7', store: 'apple' });

    const outcome = await buyCredits('credits_300', storePort);

    expect(outcome).toEqual({ status: 'pending' });
    expect(call).toHaveBeenCalledTimes(2);
  });
});
