import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { HOUSEHOLD_HEADER } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { reminderSettings } from '../db/schema.js';
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
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';

describe('reminders/settings HTTP', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let userId: string;
  let householdId: string;
  let token: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db, `test+reminders-${randomUUID()}@example.com`);
    householdId = await seedHousehold(ctx.db, userId, 'owner');
    token = await ctx.jwt.signAsync({ sub: userId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [RemindersController],
      providers: [{ provide: DB, useValue: ctx.db }, AuthGuard, HouseholdGuard, RemindersService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, householdId));
  });

  afterAll(async () => {
    await app?.close();
    await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, householdId));
    await cleanup(ctx.db, { households: [householdId], users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  const auth = (req: request.Test) =>
    req
      .set('authorization', `Bearer ${token}`)
      .set(HOUSEHOLD_HEADER, householdId);

  it('returns defaults on first GET', async () => {
    const res = await auth(request(app.getHttpServer()).get('/reminders/settings')).expect(200);
    expect(res.body).toMatchObject({
      householdId,
      breakEnabled: true,
      breakCadenceMinutes: 60,
      quietHoursStart: 22,
    });
  });

  it('PATCH persists a partial update and echoes the merged settings', async () => {
    const res = await auth(request(app.getHttpServer()).patch('/reminders/settings'))
      .send({ breakCadenceMinutes: 30, hydrationEnabled: false })
      .expect(200);
    expect(res.body).toMatchObject({
      breakCadenceMinutes: 30,
      hydrationEnabled: false,
      stretchEnabled: true,
    });
  });

  it('rejects an unsupported cadence with a validation error', async () => {
    await auth(request(app.getHttpServer()).patch('/reminders/settings'))
      .send({ breakCadenceMinutes: 45 })
      .expect(400);
  });

  // HOUSEHOLD_REQUIRED maps to HTTP 428 per ERROR_STATUS in @kitchen/contracts
  it('requires the household header', async () => {
    await request(app.getHttpServer())
      .get('/reminders/settings')
      .set('authorization', `Bearer ${token}`)
      .expect(428);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/reminders/settings')
      .set(HOUSEHOLD_HEADER, householdId)
      .expect(401);
  });
});
