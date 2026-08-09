import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { HOUSEHOLD_HEADER, syncEventsRequestSchema, type InventoryEventInput } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import { JSON_BODY_LIMIT } from '../common/limits.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { InventoryController } from '../inventory/inventory.controller.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { cleanup, createTestContext, seedHousehold, seedUser, type TestContext } from './harness.js';

/**
 * The transport must accept every request the contract declares legal.
 *
 * `syncEventsRequestSchema` caps a batch at 500 events and the mobile client
 * batches at exactly that number, so a full offline queue is the normal case,
 * not an edge case. 500 events serialise to well over Express's 100KB default
 * body limit, and body-parser's `PayloadTooLargeError` is thrown from middleware
 * — outside any route handler, where `AppExceptionFilter` can only render it as
 * a generic 500 `INTERNAL_ERROR`. The client cannot tell that apart from a
 * server fault: `flushInventoryQueue` rethrows anything that is not a
 * `NetworkError`, so the queue never drains and the writes are lost for good.
 *
 * These tests drive the real controller, guards and filter over real HTTP, and
 * pin both halves: the configured app accepts a full batch, and the Express
 * default (asserted here, not assumed) would have swallowed it.
 */
describe('sync body limit (real HTTP stack)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let defaultLimitApp: INestApplication;

  let userId: string;
  let householdId: string;
  let token: string;

  /** A maximal, contract-valid batch — every field populated as a client would. */
  const fullBatch = {
    events: Array.from({ length: 500 }, (): InventoryEventInput => ({
      clientEventId: randomUUID(),
      itemId: randomUUID(),
      delta: -1.5,
      unit: 'g',
      reason: 'consumed',
      mealPlanEntryId: randomUUID(),
      occurredAt: new Date().toISOString(),
    })),
  };

  async function buildApp(configureLimit: boolean): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [InventoryController],
      providers: [
        { provide: DB, useValue: ctx.db },
        AuthGuard,
        HouseholdGuard,
        CatalogService,
        InventoryService,
      ],
    }).compile();

    const created = moduleRef.createNestApplication<NestExpressApplication>();
    if (configureLimit) created.useBodyParser('json', { limit: JSON_BODY_LIMIT });
    created.useGlobalFilters(new AppExceptionFilter());
    await created.init();
    return created;
  }

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
    householdId = await seedHousehold(ctx.db, userId, 'owner');
    token = await ctx.jwt.signAsync({ sub: userId });

    app = await buildApp(true);
    defaultLimitApp = await buildApp(false);
  });

  afterAll(async () => {
    await app?.close();
    await defaultLimitApp?.close();
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  function post(target: INestApplication) {
    return request(target.getHttpServer())
      .post('/inventory/events:sync')
      .set('authorization', `Bearer ${token}`)
      .set(HOUSEHOLD_HEADER, householdId)
      .set('content-type', 'application/json')
      .send(fullBatch);
  }

  it('builds a batch the contract accepts but the Express default does not', () => {
    expect(syncEventsRequestSchema.safeParse(fullBatch).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(fullBatch))).toBeGreaterThan(100 * 1024);
  });

  it('accepts a maximal batch and answers with the contract response', async () => {
    const res = await post(app);

    expect(res.status).toBe(201);
    // Unknown item ids, so every event is rejected — but rejected *by us*, in
    // the contract's shape, which is what lets the client drain its queue.
    expect(res.body.rejected).toHaveLength(500);
    expect(res.body.applied).toEqual([]);
  });

  it('would have failed opaquely without the configured limit', async () => {
    const res = await post(defaultLimitApp);

    // Not 413, and not a contract error the client can act on: the size failure
    // is indistinguishable from the server falling over.
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});
