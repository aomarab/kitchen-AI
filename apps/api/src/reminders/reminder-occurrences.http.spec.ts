import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { HOUSEHOLD_HEADER } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { reminderOccurrences, reminderSettings } from '../db/schema.js';
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
import { ReminderOccurrencesController } from './reminder-occurrences.controller.js';
import { RemindersFiringService } from './reminders-firing.service.js';
import { RemindersService } from './reminders.service.js';

describe('reminders/occurrences HTTP', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let userId: string;
  let householdId: string;
  let otherHouseholdId: string;
  let token: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db, `test+occurrences-${randomUUID()}@example.com`);
    householdId = await seedHousehold(ctx.db, userId, 'owner');
    otherHouseholdId = await seedHousehold(ctx.db, userId, 'owner');
    token = await ctx.jwt.signAsync({ sub: userId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [ReminderOccurrencesController],
      providers: [
        { provide: DB, useValue: ctx.db },
        AuthGuard,
        HouseholdGuard,
        RemindersService,
        RemindersFiringService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    for (const id of [householdId, otherHouseholdId]) {
      await ctx.db.delete(reminderOccurrences).where(eq(reminderOccurrences.householdId, id));
      await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, id));
    }
  });

  afterAll(async () => {
    await app?.close();
    for (const id of [householdId, otherHouseholdId]) {
      await ctx.db.delete(reminderOccurrences).where(eq(reminderOccurrences.householdId, id));
      await ctx.db.delete(reminderSettings).where(eq(reminderSettings.householdId, id));
    }
    await cleanup(ctx.db, {
      households: [householdId, otherHouseholdId],
      users: [userId],
    });
    await ctx.client.end({ timeout: 5 });
  });

  const auth = (req: request.Test) =>
    req.set('authorization', `Bearer ${token}`).set(HOUSEHOLD_HEADER, householdId);

  /**
   * Insert one nudge directly rather than running the engine. These are
   * routing, guard and serialization tests, and `sweep` is deliberately global
   * — letting another spec file's sweep race this fixture would make the suite
   * pass or fail on test ordering. The fire instant is in the past so the
   * acknowledgement is not rejected by `reminder_ack_not_before_fire`.
   */
  const seedNudge = async (id = householdId) => {
    const [nudge] = await ctx.db
      .insert(reminderOccurrences)
      .values({
        householdId: id,
        type: 'morning',
        channel: 'screen',
        messageKey: 'reminders.morning.body',
        firedAt: new Date(Date.now() - 60_000),
      })
      .returning();
    return nudge!;
  };

  it('lists an empty day without failing', async () => {
    const res = await auth(request(app.getHttpServer()).get('/reminders/occurrences')).expect(200);
    expect(res.body).toEqual([]);
  });

  it('returns the fired nudge as a message key, never as prose', async () => {
    await seedNudge();
    const res = await auth(
      request(app.getHttpServer())
        .get('/reminders/occurrences')
        .query({ since: new Date(Date.now() - 3_600_000).toISOString() }),
    ).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      householdId,
      type: 'morning',
      channel: 'screen',
      messageKey: 'reminders.morning.body',
      acknowledgedAt: null,
    });
  });

  it('acknowledges a nudge', async () => {
    const nudge = await seedNudge();
    const res = await auth(
      request(app.getHttpServer()).post(`/reminders/occurrences/${nudge.id}/acknowledge`),
    ).expect(201);
    expect(res.body.acknowledgedAt).not.toBeNull();
  });

  it('rejects a malformed occurrence id with a validation error', async () => {
    await auth(
      request(app.getHttpServer()).post('/reminders/occurrences/not-a-uuid/acknowledge'),
    ).expect(400);
  });

  it('rejects a malformed since query', async () => {
    await auth(
      request(app.getHttpServer()).get('/reminders/occurrences').query({ since: 'yesterday' }),
    ).expect(400);
  });

  it('cannot acknowledge another household\u2019s nudge', async () => {
    const nudge = await seedNudge(otherHouseholdId);
    await auth(
      request(app.getHttpServer()).post(`/reminders/occurrences/${nudge.id}/acknowledge`),
    ).expect(404);
  });

  // HOUSEHOLD_REQUIRED maps to HTTP 428 per ERROR_STATUS in @kitchen/contracts
  it('requires the household header', async () => {
    await request(app.getHttpServer())
      .get('/reminders/occurrences')
      .set('authorization', `Bearer ${token}`)
      .expect(428);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/reminders/occurrences')
      .set(HOUSEHOLD_HEADER, householdId)
      .expect(401);
  });
});
