import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { FEEDBACK_DAILY_LIMIT, FEEDBACK_MESSAGE_MAX } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { feedback } from '../db/schema.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

const body = {
  rating: 4,
  message: 'The scan missed my olive oil.',
  platform: 'ios' as const,
  appVersion: '1.2.3',
  locale: 'en' as const,
};

describe('POST /feedback', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let userId: string;
  let otherUserId: string;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
    token = await ctx.jwt.signAsync({ sub: userId });
    otherUserId = await seedUser(ctx.db, `test+feedback-${randomUUID()}@example.com`);
    otherToken = await ctx.jwt.signAsync({ sub: otherUserId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [FeedbackController],
      providers: [{ provide: DB, useValue: ctx.db }, AuthGuard, FeedbackService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    await ctx.db.delete(feedback).where(eq(feedback.userId, userId));
    await ctx.db.delete(feedback).where(eq(feedback.userId, otherUserId));
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { users: [userId, otherUserId] });
    await ctx.client.end({ timeout: 5 });
  });

  const post = (payload: string | Record<string, unknown> | undefined) =>
    request(app.getHttpServer())
      .post('/feedback')
      .set('authorization', `Bearer ${token}`)
      .send(payload);

  it('stores a submission and returns only the receipt', async () => {
    const res = await post(body);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['createdAt', 'id']);

    const [row] = await ctx.db.select().from(feedback).where(eq(feedback.id, res.body.id));
    expect(row).toMatchObject({
      userId,
      rating: 4,
      message: body.message,
      platform: 'ios',
      appVersion: '1.2.3',
      locale: 'en',
      status: 'new',
      adminNote: null,
      reviewedBy: null,
      reviewedAt: null,
    });
  });

  it('accepts a rating with no message', async () => {
    const { message: _message, ...noMessage } = body;
    const res = await post(noMessage);

    expect(res.status).toBe(201);
    const [row] = await ctx.db.select().from(feedback).where(eq(feedback.id, res.body.id));
    expect(row?.message).toBeNull();
  });

  it.each([0, 6])('rejects rating %i', async (rating) => {
    const res = await post({ ...body, rating });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it.each([1, 5])('accepts rating %i', async (rating) => {
    expect((await post({ ...body, rating })).status).toBe(201);
  });

  it('rejects a message over the contract limit', async () => {
    const res = await post({ ...body, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects the submission after the daily limit with a translatable key', async () => {
    for (let i = 0; i < FEEDBACK_DAILY_LIMIT; i += 1) {
      expect((await post(body)).status).toBe(201);
    }

    const res = await post(body);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      code: 'RATE_LIMITED',
      messageKey: 'errors.feedbackRateLimited',
    });
    const rows = await ctx.db.select().from(feedback).where(eq(feedback.userId, userId));
    expect(rows).toHaveLength(FEEDBACK_DAILY_LIMIT);
  });

  it('keeps the rate limit scoped to the calling user', async () => {
    for (let i = 0; i < FEEDBACK_DAILY_LIMIT; i += 1) {
      expect((await post(body)).status).toBe(201);
    }

    const limited = await post(body);
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      code: 'RATE_LIMITED',
      messageKey: 'errors.feedbackRateLimited',
    });

    const other = await request(app.getHttpServer())
      .post('/feedback')
      .set('authorization', `Bearer ${otherToken}`)
      .send(body);
    expect(other.status).toBe(201);

    const rows = await ctx.db.select().from(feedback).where(eq(feedback.userId, otherUserId));
    expect(rows).toHaveLength(1);
  });

  it('counts only the last 24 hours toward the limit', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await ctx.db.insert(feedback).values(
      Array.from({ length: FEEDBACK_DAILY_LIMIT }, () => ({
        userId,
        rating: 3,
        platform: 'web' as const,
        appVersion: '1.0.0',
        locale: 'en' as const,
        createdAt: old,
      })),
    );

    expect((await post(body)).status).toBe(201);
  });

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer()).post('/feedback').send(body);
    expect(res.status).toBe(401);
  });
});
