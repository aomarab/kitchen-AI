import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, cleanup, seedUser, type TestContext } from '../testing/harness.js';
import { oauthAccounts } from '../db/schema.js';

describe('oauth_accounts revocation columns', () => {
  let ctx: TestContext;
  let userId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    userId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: [userId] });
    await ctx.client.end();
  });

  it('stores and reads back the encrypted token and its client id', async () => {
    const [row] = await ctx.db
      .insert(oauthAccounts)
      .values({
        userId,
        provider: 'apple',
        providerAccountId: randomUUID(),
        refreshTokenEncrypted: 'iv.tag.data',
        revokeClientId: 'ai.kitchen.app',
      })
      .returning();

    expect(row?.refreshTokenEncrypted).toBe('iv.tag.data');
    expect(row?.revokeClientId).toBe('ai.kitchen.app');
  });

  it('defaults both columns to null, so existing Apple links keep working', async () => {
    const [row] = await ctx.db
      .insert(oauthAccounts)
      .values({ userId, provider: 'google', providerAccountId: randomUUID() })
      .returning();

    expect(row?.refreshTokenEncrypted).toBeNull();
    expect(row?.revokeClientId).toBeNull();
  });
});
