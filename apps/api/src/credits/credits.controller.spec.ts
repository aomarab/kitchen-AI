import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { creditBalanceSchema, FREE_MONTHLY_GRANT } from '@kitchen/contracts';
import { AppModule } from '../app.module.js';
import { DB } from '../db/index.js';
import { AppExceptionFilter } from '../common/errors.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import type { HouseholdContext } from '../common/request-context.js';
import { CreditsController } from './credits.controller.js';

/* ── Unit test (method body) ─────────────────────────────── */

const household: HouseholdContext = { id: '00000000-0000-4000-8000-000000000000', role: 'owner' };

describe('CreditsController unit', () => {
  it('returns the household balance', async () => {
    const service = {
      balance: vi.fn().mockResolvedValue({
        householdId: household.id,
        freeBalance: FREE_MONTHLY_GRANT,
        paidBalance: 0,
        grantPeriod: '2026-08',
        freeGrant: FREE_MONTHLY_GRANT,
      }),
    };
    const controller = new CreditsController(service as never, {} as never);

    const result = await controller.balance(household);

    expect(result.freeBalance).toBe(FREE_MONTHLY_GRANT);
    expect(service.balance).toHaveBeenCalledWith(household.id);
  });
});

/* ── HTTP integration tests ──────────────────────────────── */

describe('Credits HTTP routes', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let userId: string;
  let householdId: string;
  let token: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId);
    token = await ctx.jwt.signAsync({ sub: userId });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(ctx.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  /* GET /credits */

  it('GET /credits — no auth token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/credits');
    expect(res.status).toBe(401);
  });

  it('GET /credits — valid token, no x-household-id → 428', async () => {
    const res = await request(app.getHttpServer())
      .get('/credits')
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(428);
    expect(res.body.code).toBe('HOUSEHOLD_REQUIRED');
  });

  it('GET /credits — valid token + household → 200, valid creditBalanceSchema', async () => {
    const res = await request(app.getHttpServer())
      .get('/credits')
      .set('authorization', `Bearer ${token}`)
      .set('x-household-id', householdId);

    expect(res.status).toBe(200);
    const parsed = creditBalanceSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.freeBalance).toBe(FREE_MONTHLY_GRANT);
    }
  });

  /* POST /credits/intents — auth + validation guards */

  it('POST /credits/intents — no auth → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/credits/intents')
      .send({ productId: 'credits_300' });
    expect(res.status).toBe(401);
  });

  it('POST /credits/intents — valid auth, malformed body → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/credits/intents')
      .set('authorization', `Bearer ${token}`)
      .set('x-household-id', householdId)
      .send({ productId: 123 }); // productId must be a string

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  /* POST /credits/purchases — auth guard */

  it('POST /credits/purchases — no auth → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/credits/purchases')
      .send({
        intentId: '00000000-0000-4000-8000-000000000000',
        storeTransactionId: 'x',
        store: 'apple',
      });
    expect(res.status).toBe(401);
  });
});
