import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { TokenPair } from '@kitchen/contracts';
import { AppError } from '../common/errors.js';
import { refreshTokens } from '../db/schema.js';
import { TokenService } from './token.service.js';
import { createTestContext, seedUser, cleanup, type TestContext } from '../testing/harness.js';

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError(${code}) but none was thrown`);
}

/** Age every already-revoked token of the user so a replay falls outside the grace window. */
async function backdateRevocations(ctx: TestContext, userId: string, ms = 60_000): Promise<void> {
  await ctx.db
    .update(refreshTokens)
    .set({ revokedAt: new Date(Date.now() - ms) })
    .where(and(eq(refreshTokens.userId, userId), isNotNull(refreshTokens.revokedAt)));
}

describe('TokenService refresh rotation', () => {
  let ctx: TestContext;
  let service: TokenService;
  let userId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    service = new TokenService(ctx.db, ctx.env, ctx.jwt);
    userId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: [userId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('issues an access + refresh token pair', async () => {
    const pair = await service.issue(userId);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.expiresIn).toBeGreaterThan(0);
  });

  it('rotates a refresh token, then treats a long-delayed replay as theft', async () => {
    const first = await service.issue(userId);

    const rotated = await service.rotate(first.refreshToken);
    expect(rotated.userId).toBe(userId);
    expect(rotated.tokens.refreshToken).not.toEqual(first.refreshToken);

    // Replaying the spent token well after rotation (outside the grace window)
    // is genuine reuse: reject it and revoke the whole family.
    await backdateRevocations(ctx, userId);
    await expectAppError(service.rotate(first.refreshToken), 'UNAUTHENTICATED');
    await expectAppError(service.rotate(rotated.tokens.refreshToken), 'UNAUTHENTICATED');
  });

  it('treats an immediate replay within the grace window as a benign loser, not theft', async () => {
    const first = await service.issue(userId);
    const otherSession = await service.issue(userId);

    const rotated = await service.rotate(first.refreshToken);

    // Replaying the just-revoked token immediately must reject only this
    // request and leave the family untouched.
    await expectAppError(service.rotate(first.refreshToken), 'UNAUTHENTICATED');

    const winner = await service.rotate(rotated.tokens.refreshToken);
    expect(winner.userId).toBe(userId);
    const other = await service.rotate(otherSession.refreshToken);
    expect(other.userId).toBe(userId);
  });

  it('serializes two concurrent rotations of the same token: exactly one wins, the family survives', async () => {
    const victim = await service.issue(userId);
    const otherSession = await service.issue(userId);

    const results = await Promise.allSettled([
      service.rotate(victim.refreshToken),
      service.rotate(victim.refreshToken),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<{ userId: string; tokens: TokenPair }> =>
        r.status === 'fulfilled',
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(AppError);
    expect((rejected[0]!.reason as AppError).code).toBe('UNAUTHENTICATED');

    // The loser must not have nuked the family: the winner's new token works...
    const rotatedWinner = await service.rotate(fulfilled[0]!.value.tokens.refreshToken);
    expect(rotatedWinner.userId).toBe(userId);

    // ...and the user's other, untouched session still refreshes.
    const rotatedOther = await service.rotate(otherSession.refreshToken);
    expect(rotatedOther.userId).toBe(userId);
  });

  it('rejects an unknown refresh token', async () => {
    await expectAppError(service.rotate('this-token-was-never-issued'), 'UNAUTHENTICATED');
  });
});
