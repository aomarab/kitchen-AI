import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { HOUSEHOLD_HEADER } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { cookingTimers } from '../db/schema.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { HouseholdGuard } from '../common/household.guard.js';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import { TimersController } from './timers.controller.js';
import { TimersService } from './timers.service.js';

describe('timers HTTP', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let userId: string;
  let householdId: string;
  let token: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db, `test+timers-http-${randomUUID()}@example.com`);
    householdId = await seedHousehold(ctx.db, userId, 'owner');
    token = await ctx.jwt.signAsync({ sub: userId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [TimersController],
      providers: [{ provide: DB, useValue: ctx.db }, AuthGuard, HouseholdGuard, TimersService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    await ctx.db.delete(cookingTimers).where(eq(cookingTimers.householdId, householdId));
  });

  afterAll(async () => {
    await app?.close();
    await ctx.db.delete(cookingTimers).where(eq(cookingTimers.householdId, householdId));
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  const auth = (req: request.Test) =>
    req.set('authorization', `Bearer ${token}`).set(HOUSEHOLD_HEADER, householdId);

  it('creates, lists and deletes a timer', async () => {
    const created = await auth(request(app.getHttpServer()).post('/timers'))
      .send({ label: 'Rice', durationSec: 600 })
      .expect(201);
    expect(created.body).toMatchObject({ label: 'Rice', status: 'running', householdId });

    const listed = await auth(request(app.getHttpServer()).get('/timers')).expect(200);
    expect(listed.body.items).toHaveLength(1);

    await auth(request(app.getHttpServer()).delete(`/timers/${created.body.id}`)).expect(200);
    const empty = await auth(request(app.getHttpServer()).get('/timers')).expect(200);
    expect(empty.body.items).toEqual([]);
  });

  it('defaults an extend with no amount to one minute', async () => {
    const created = await auth(request(app.getHttpServer()).post('/timers'))
      .send({ label: 'Rice', durationSec: 600 })
      .expect(201);
    const extended = await auth(
      request(app.getHttpServer()).patch(`/timers/${created.body.id}`),
    )
      .send({ action: 'extend' })
      .expect(200);
    expect(extended.body.durationSec).toBe(660);
  });

  it('rejects an unknown action and a malformed duration with a validation envelope', async () => {
    const created = await auth(request(app.getHttpServer()).post('/timers'))
      .send({ label: 'Rice', durationSec: 600 })
      .expect(201);

    const bad = await auth(request(app.getHttpServer()).patch(`/timers/${created.body.id}`))
      .send({ action: 'restart' })
      .expect(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED' });

    await auth(request(app.getHttpServer()).post('/timers'))
      .send({ label: 'Rice', durationSec: 0 })
      .expect(400);
  });

  it('rejects a non-uuid timer id before it reaches the database', async () => {
    await auth(request(app.getHttpServer()).patch('/timers/not-a-uuid'))
      .send({ action: 'stop' })
      .expect(400);
  });

  it('answers 404 for a timer belonging to nobody', async () => {
    const res = await auth(request(app.getHttpServer()).delete(`/timers/${randomUUID()}`)).expect(
      404,
    );
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('surfaces an illegal transition as a conflict with a translatable key', async () => {
    const created = await auth(request(app.getHttpServer()).post('/timers'))
      .send({ label: 'Rice', durationSec: 600 })
      .expect(201);
    const res = await auth(request(app.getHttpServer()).patch(`/timers/${created.body.id}`))
      .send({ action: 'resume' })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'CONFLICT', messageKey: 'errors.timerNotPaused' });
  });

  // HOUSEHOLD_REQUIRED maps to HTTP 428 per ERROR_STATUS in @kitchen/contracts
  it('requires the household header', async () => {
    await request(app.getHttpServer())
      .get('/timers')
      .set('authorization', `Bearer ${token}`)
      .expect(428);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/timers')
      .set(HOUSEHOLD_HEADER, householdId)
      .expect(401);
  });
});
