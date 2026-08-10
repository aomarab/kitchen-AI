import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { feedback, users } from './schema.js';

/**
 * The rating CHECK lives in Postgres, not just in zod: the API is not the only
 * writer (seeds, backfills and psql all are), and a 0-star row would break the
 * average the console reports.
 */
describe('feedback schema', () => {
  let ctx: TestContext;
  let userId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('defaults a new account to the user role', async () => {
    const [row] = await ctx.db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    expect(row?.role).toBe('user');
  });

  it('stores a submission with server defaults', async () => {
    const [row] = await ctx.db
      .insert(feedback)
      .values({ userId, rating: 5, platform: 'ios', appVersion: '1.0.0', locale: 'en' })
      .returning();

    expect(row?.status).toBe('new');
    expect(row?.message).toBeNull();
    expect(row?.reviewedBy).toBeNull();
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('refuses a rating outside 1-5 at the database level', async () => {
    await expect(
      ctx.db
        .insert(feedback)
        .values({ userId, rating: 0, platform: 'web', appVersion: '1.0.0', locale: 'en' }),
    ).rejects.toThrow();
    await expect(
      ctx.db
        .insert(feedback)
        .values({ userId, rating: 6, platform: 'web', appVersion: '1.0.0', locale: 'en' }),
    ).rejects.toThrow();
  });

  it('deletes feedback with the account', async () => {
    const scratch = await seedUser(ctx.db);
    await ctx.db
      .insert(feedback)
      .values({ userId: scratch, rating: 3, platform: 'android', appVersion: '1.0.0', locale: 'ar' });
    await cleanup(ctx.db, { users: [scratch] });

    const rows = await ctx.db.select().from(feedback).where(eq(feedback.userId, scratch));
    expect(rows).toEqual([]);
  });
});
