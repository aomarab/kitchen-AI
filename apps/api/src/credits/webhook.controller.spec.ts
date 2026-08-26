import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { DB } from '../db/index.js';
import { ENV, loadEnv } from '../config/env.js';
import { AppExceptionFilter } from '../common/errors.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { PurchaseService } from './purchase.service.js';
import { CreditsService } from './credits.service.js';

const WEBHOOK_SECRET = 'test-webhook-secret';

/** A well-formed RevenueCat purchase event for a given intent. */
function purchaseBody(intentId: string, transactionId: string) {
  return {
    event: {
      type: 'INITIAL_PURCHASE',
      intent_id: intentId,
      transaction_id: transactionId,
      product_id: 'credits_300',
      store: 'APP_STORE',
    },
  };
}

describe('RevenueCat webhook HTTP route', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let purchases: PurchaseService;
  let credits: CreditsService;
  let userId: string;
  let householdId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);

    const env = { ...loadEnv(), REVENUECAT_WEBHOOK_SECRET: WEBHOOK_SECRET, PAYMENTS_MOCK: true };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(ctx.db)
      .overrideProvider(ENV)
      .useValue(env)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();

    purchases = app.get(PurchaseService);
    credits = app.get(CreditsService);
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('rejects a wrong secret with 401 and moves no balance', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const before = await credits.balance(householdId);

    const res = await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .set('authorization', 'wrong-secret')
      .send(purchaseBody(intent.intentId, 'txn-wrong-secret'));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');

    const after = await credits.balance(householdId);
    expect(after.paidBalance).toBe(before.paidBalance);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const before = await credits.balance(householdId);

    const res = await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .send(purchaseBody(intent.intentId, 'txn-no-header'));

    expect(res.status).toBe(401);

    const after = await credits.balance(householdId);
    expect(after.paidBalance).toBe(before.paidBalance);
  });

  it('credits the household when the secret is correct', async () => {
    const intent = await purchases.createIntent(householdId, userId, 'credits_300');
    const before = await credits.balance(householdId);

    const res = await request(app.getHttpServer())
      .post('/webhooks/revenuecat')
      .set('authorization', WEBHOOK_SECRET)
      .send(purchaseBody(intent.intentId, 'txn-correct-secret'));

    expect(res.status).toBe(200);

    const after = await credits.balance(householdId);
    expect(after.paidBalance).toBe(before.paidBalance + 300);
  });
});
