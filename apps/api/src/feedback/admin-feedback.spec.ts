import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import type { FeedbackPlatform, FeedbackStatus } from '@kitchen/contracts';
import { DB } from '../db/index.js';
import { feedback } from '../db/schema.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { StaffGuard } from '../common/staff.guard.js';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { AdminFeedbackController } from './admin-feedback.controller.js';
import { AdminFeedbackService } from './admin-feedback.service.js';

interface Row {
  rating: number;
  platform: FeedbackPlatform;
  status: FeedbackStatus;
  minutesAgo: number;
}

/** Newest first, so `rows[0]` is the most recent. */
const ROWS: Row[] = [
  { rating: 5, platform: 'ios', status: 'new', minutesAgo: 1 },
  { rating: 1, platform: 'android', status: 'new', minutesAgo: 2 },
  { rating: 3, platform: 'web', status: 'triaged', minutesAgo: 3 },
  { rating: 4, platform: 'ios', status: 'resolved', minutesAgo: 4 },
  { rating: 2, platform: 'ios', status: 'new', minutesAgo: 5 },
];

describe('admin feedback routes', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let staffId: string;
  let authorId: string;
  let staffToken: string;
  let authorToken: string;
  let ids: string[] = [];

  beforeAll(async () => {
    ctx = createTestContext();
    staffId = await seedUser(ctx.db, undefined, 'staff');
    authorId = await seedUser(ctx.db, `author+${Date.now()}@example.com`);
    staffToken = await ctx.jwt.signAsync({ sub: staffId });
    authorToken = await ctx.jwt.signAsync({ sub: authorId });

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [AdminFeedbackController],
      providers: [{ provide: DB, useValue: ctx.db }, AuthGuard, StaffGuard, AdminFeedbackService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (ids.length) await ctx.db.delete(feedback).where(inArray(feedback.id, ids));
    ids = [];
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { users: [staffId, authorId] });
    await ctx.client.end({ timeout: 5 });
  });

  /**
   * The table is global, so other suites' rows would otherwise leak into these
   * assertions. Every query below is filtered by this run's app version.
   */
  const tag = `spec-${Date.now()}`;

  async function seedRows(): Promise<void> {
    const anchor = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const inserted = await ctx.db
      .insert(feedback)
      .values(
        ROWS.map((row) => ({
          userId: authorId,
          rating: row.rating,
          message: `Message ${row.rating}`,
          platform: row.platform,
          appVersion: tag,
          locale: 'en' as const,
          status: row.status,
          createdAt: new Date(anchor - row.minutesAgo * 60 * 1000),
        })),
      )
      .returning({ id: feedback.id });
    ids = inserted.map((r) => r.id);
  }

  const get = (path: string, token = staffToken) =>
    request(app.getHttpServer()).get(path).set('authorization', `Bearer ${token}`);

  const patch = (path: string, body: Record<string, unknown>, token = staffToken) =>
    request(app.getHttpServer()).patch(path).set('authorization', `Bearer ${token}`).send(body);

  it('rejects non-staff on every admin route', async () => {
    await seedRows();

    expect((await get('/admin/feedback', authorToken)).status).toBe(403);
    expect((await get('/admin/feedback/stats', authorToken)).status).toBe(403);
    expect((await get(`/admin/feedback/${ids[0]!}`, authorToken)).status).toBe(403);
    expect(
      (await patch(`/admin/feedback/${ids[0]!}`, { status: 'resolved' }, authorToken)).status,
    ).toBe(403);
  });

  it('lists newest first', async () => {
    await seedRows();
    const res = await get('/admin/feedback?limit=5');

    expect(res.status).toBe(200);
    const mine = res.body.items.filter((i: { appVersion: string }) => i.appVersion === tag);
    expect(mine.map((i: { rating: number }) => i.rating)).toEqual([5, 1, 3, 4, 2]);
  });

  it('filters by status, rating and platform together', async () => {
    await seedRows();

    const filtered = await get('/admin/feedback?limit=100&status=new&rating=5&platform=ios');
    const mine = filtered.body.items.filter((i: { appVersion: string }) => i.appVersion === tag);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ rating: 5, status: 'new', platform: 'ios' });
  });

  it('pages with an opaque cursor', async () => {
    await seedRows();

    const first = await get('/admin/feedback?limit=2&platform=ios');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await get(
      `/admin/feedback?limit=2&platform=ios&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    const firstIds = first.body.items.map((i: { id: string }) => i.id);
    const secondIds = second.body.items.map((i: { id: string }) => i.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it('returns the submitter with the detail view but no household data', async () => {
    await seedRows();
    const res = await get(`/admin/feedback/${ids[0]!}`);

    expect(res.status).toBe(200);
    expect(res.body.submitter).toMatchObject({ id: authorId });
    expect(res.body.submitter.email).toContain('@');
    expect(res.body.submitter.joinedAt).toBeTruthy();
    expect(res.body).not.toHaveProperty('householdId');
  });

  it('404s an unknown id', async () => {
    const res = await get('/admin/feedback/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('404s a missing row on update', async () => {
    const res = await patch('/admin/feedback/00000000-0000-4000-8000-000000000000', {
      status: 'resolved',
    });

    expect(res.status).toBe(404);
  });

  it('400s a non-uuid id', async () => {
    const res = await get('/admin/feedback/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('stamps the reviewer and time on update', async () => {
    await seedRows();
    const before = Date.now();

    const res = await patch(`/admin/feedback/${ids[0]!}`, {
      status: 'resolved',
      adminNote: 'Fixed in 1.3.0.',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ids[0],
      rating: 5,
      message: 'Message 5',
      platform: 'ios',
      appVersion: tag,
      locale: 'en',
      status: 'resolved',
      createdAt: expect.any(String),
      adminNote: 'Fixed in 1.3.0.',
      reviewedAt: expect.any(String),
      submitter: {
        id: authorId,
        email: expect.stringContaining('@'),
        displayName: expect.any(String),
        locale: 'en',
        joinedAt: expect.any(String),
      },
    });

    const [row] = await ctx.db.select().from(feedback).where(eq(feedback.id, ids[0]!));
    expect(row?.reviewedBy).toBe(staffId);
    expect(row?.reviewedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('keeps update atomic against a concurrent delete', async () => {
    await seedRows();
    const service = app.get(AdminFeedbackService) as unknown as {
      loadDetail(db: unknown, id: string): Promise<unknown>;
    };
    const originalLoadDetail = service.loadDetail.bind(service);
    const loadDetailSpy = vi.spyOn(service, 'loadDetail').mockImplementation(
      async (db: unknown, id: string) => {
        void ctx.db.delete(feedback).where(eq(feedback.id, id)).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 150));
        return originalLoadDetail(db, id);
      },
    );

    try {
      const res = await patch(`/admin/feedback/${ids[0]!}`, { status: 'resolved' });
      expect(res.status).toBe(200);
    } finally {
      loadDetailSpy.mockRestore();
    }
  });

  it('allows any status transition, including back to new', async () => {
    await seedRows();

    expect((await patch(`/admin/feedback/${ids[3]!}`, { status: 'wont_fix' })).status).toBe(200);
    const back = await patch(`/admin/feedback/${ids[3]!}`, { status: 'new' });
    expect(back.status).toBe(200);
    expect(back.body.status).toBe('new');
  });

  it('rejects an empty patch', async () => {
    await seedRows();
    const res = await request(app.getHttpServer())
      .patch(`/admin/feedback/${ids[0]!}`)
      .set('authorization', `Bearer ${staffToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('reports totals, average and breakdowns', async () => {
    await seedRows();
    const res = await get('/admin/feedback/stats');

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    expect(res.body.averageRating).toBeGreaterThan(0);
    // Every status key is present even at zero, so the console never renders a gap.
    expect(Object.keys(res.body.byStatus).sort()).toEqual([
      'new',
      'resolved',
      'triaged',
      'wont_fix',
    ]);
    expect(Object.keys(res.body.byRating).sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('matches /admin/feedback/stats as the literal route, not as an id', async () => {
    const res = await get('/admin/feedback/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
  });
});
