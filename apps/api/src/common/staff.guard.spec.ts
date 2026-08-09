import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { AppError } from './errors.js';
import { StaffGuard } from './staff.guard.js';

function contextFor(authUser: { userId: string } | undefined): ExecutionContext {
  const request = { authUser };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('StaffGuard', () => {
  let ctx: TestContext;
  let guard: StaffGuard;
  let staffId: string;
  let plainId: string;

  beforeAll(async () => {
    ctx = createTestContext();
    guard = new StaffGuard(ctx.db);
    staffId = await seedUser(ctx.db, undefined, 'staff');
    plainId = await seedUser(ctx.db);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: [staffId, plainId] });
    await ctx.client.end({ timeout: 5 });
  });

  it('admits a staff account', async () => {
    await expect(guard.canActivate(contextFor({ userId: staffId }))).resolves.toBe(true);
  });

  it('rejects an ordinary account with FORBIDDEN', async () => {
    await expect(guard.canActivate(contextFor({ userId: plainId }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const context = contextFor({ userId: '00000000-0000-4000-8000-000000000000' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects when AuthGuard has not run', async () => {
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(AppError);
  });
});
