import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CREDIT_PACKS,
  FREE_MONTHLY_GRANT,
  creditBalanceSchema,
  purchaseIntentSchema,
} from '@kitchen/contracts';
import { createTestServer } from './server.node';

const BASE = 'http://localhost:3333';
const server = createTestServer(BASE);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('credits MSW resolvers', () => {
  it('getCredits returns a full free grant that satisfies the contract', async () => {
    const res = await fetch(`${BASE}/credits`);
    expect(res.status).toBe(200);
    const balance = creditBalanceSchema.parse(await res.json());
    expect(balance.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(balance.paidBalance).toBe(0);
    expect(balance.freeGrant).toBe(FREE_MONTHLY_GRANT);
  });

  it('an intent can be created and confirmed, crediting only the paid balance', async () => {
    const pack = CREDIT_PACKS[0]!;
    const before = creditBalanceSchema.parse(await (await fetch(`${BASE}/credits`)).json());

    const intentRes = await fetch(`${BASE}/credits/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: pack.productId }),
    });
    expect(intentRes.status).toBe(200);
    const intent = purchaseIntentSchema.parse(await intentRes.json());
    expect(intent.credits).toBe(pack.credits);

    const confirmRes = await fetch(`${BASE}/credits/purchases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intentId: intent.intentId,
        storeTransactionId: 'txn-1',
        store: 'apple',
      }),
    });
    expect(confirmRes.status).toBe(200);
    const after = creditBalanceSchema.parse(await confirmRes.json());
    // The pack lands in paid; the free grant is untouched.
    expect(after.paidBalance).toBe(before.paidBalance + pack.credits);
    expect(after.freeBalance).toBe(before.freeBalance);
  });

  it('rejects an intent for an unknown product', async () => {
    const res = await fetch(`${BASE}/credits/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: 'not_a_pack' }),
    });
    expect(res.status).toBe(422);
  });

  it('rejects confirming an intent that does not exist', async () => {
    const res = await fetch(`${BASE}/credits/purchases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intentId: '00000000-0000-4000-8000-0000000000ff',
        storeTransactionId: 'txn-x',
        store: 'apple',
      }),
    });
    expect(res.status).toBe(404);
  });
});
