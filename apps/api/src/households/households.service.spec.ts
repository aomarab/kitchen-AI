import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { households, storageLocations } from '../db/schema.js';
import { redisConnection } from '../common/redis.js';
import { cleanup, createTestContext, seedUser, type TestContext } from '../testing/harness.js';
import { HouseholdsService } from './households.service.js';
import { INVITE_CODE_ALPHABET } from './invite-code.js';
import {
  JOIN_FAILED_ATTEMPT_IP_LIMIT,
  JOIN_FAILED_ATTEMPT_USER_LIMIT,
  JoinAttemptLimiter,
} from './join-attempt-limiter.js';

describe('HouseholdsService (live DB)', () => {
  let ctx: TestContext;
  let service: HouseholdsService;
  let limiter: JoinAttemptLimiter;
  let redis: Redis;
  let userId: string;
  let ipCounter = 0;
  const userIds: string[] = [];
  const householdIds: string[] = [];

  beforeAll(async () => {
    ctx = createTestContext();
    redis = new Redis(redisConnection(ctx.env.REDIS_URL));
    limiter = new JoinAttemptLimiter(redis);
    limiter.useKeyPrefix(`households:join-failures:test:${randomUUID()}`);
    service = new HouseholdsService(ctx.db, limiter);
    userId = await createUser();
  });

  afterAll(async () => {
    await cleanup(ctx.db, { households: householdIds, users: userIds });
    await limiter.close();
    await ctx.client.end();
  });

  async function createUser(): Promise<string> {
    const id = await seedUser(ctx.db);
    userIds.push(id);
    return id;
  }

  function clientIp(): string {
    ipCounter += 1;
    return `198.51.100.${ipCounter}`;
  }

  function legacyCode(): string {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
    }
    return code;
  }

  /**
   * Every inventory item requires a `locationId`, and nothing in either client
   * creates a location. A household that starts with none is therefore a
   * household that cannot save a scan at all — the review screen has no place
   * to put anything.
   */
  it('gives a new household somewhere to put food', async () => {
    const household = await service.create(userId, { name: 'Fresh household' });
    householdIds.push(household.id);

    const places = await ctx.db
      .select({ name: storageLocations.name, type: storageLocations.type })
      .from(storageLocations)
      .where(eq(storageLocations.householdId, household.id));

    expect(places.map((p) => p.type).sort()).toEqual(['freezer', 'fridge', 'pantry']);
  });

  it('does not share places between households', async () => {
    const a = await service.create(userId, { name: 'Household A' });
    const b = await service.create(userId, { name: 'Household B' });
    householdIds.push(a.id, b.id);

    const inA = await ctx.db
      .select({ id: storageLocations.id })
      .from(storageLocations)
      .where(eq(storageLocations.householdId, a.id));
    const inB = await ctx.db
      .select({ id: storageLocations.id })
      .from(storageLocations)
      .where(eq(storageLocations.householdId, b.id));

    expect(inA).toHaveLength(3);
    expect(inB).toHaveLength(3);
    expect(inA.map((r) => r.id).some((id) => inB.map((r) => r.id).includes(id))).toBe(false);
  });

  it('rate-limits failed joins by user before another lookup', async () => {
    const ownerId = await createUser();
    const joinerId = await createUser();
    const household = await service.create(ownerId, { name: 'Limited household' });
    householdIds.push(household.id);
    const ip = clientIp();
    const wrongCode = household.inviteCode === '2222222222' ? '3333333333' : '2222222222';

    for (let i = 0; i < JOIN_FAILED_ATTEMPT_USER_LIMIT; i += 1) {
      await expect(service.join(joinerId, wrongCode, ip)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        messageKey: 'household.invalidCode',
      });
    }

    await expect(service.join(joinerId, household.inviteCode, ip)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      messageKey: 'errors.tooManyAttempts',
    });
  });

  it('rate-limits failed joins by IP across users', async () => {
    const ip = clientIp();
    const wrongCode = '3333333333';

    for (let i = 0; i < JOIN_FAILED_ATTEMPT_IP_LIMIT; i += 1) {
      await expect(service.join(randomUUID(), wrongCode, ip)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        messageKey: 'household.invalidCode',
      });
    }

    await expect(service.join(randomUUID(), wrongCode, ip)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      messageKey: 'errors.tooManyAttempts',
    });
  });

  it('allows a correct code while failed attempts are under the limit', async () => {
    const ownerId = await createUser();
    const joinerId = await createUser();
    const household = await service.create(ownerId, { name: 'Joinable household' });
    householdIds.push(household.id);
    const ip = clientIp();
    const wrongCode = household.inviteCode === '4444444444' ? '5555555555' : '4444444444';

    for (let i = 0; i < JOIN_FAILED_ATTEMPT_USER_LIMIT - 1; i += 1) {
      await expect(service.join(joinerId, wrongCode, ip)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }

    const joined = await service.join(joinerId, household.inviteCode.toLowerCase(), ip);

    expect(joined.id).toBe(household.id);
    expect(joined.members.map((member) => member.userId)).toContain(joinerId);
  });

  it('accepts legacy six-character invite codes', async () => {
    const ownerId = await createUser();
    const joinerId = await createUser();
    const household = await service.create(ownerId, { name: 'Legacy household' });
    const inviteCode = legacyCode();
    householdIds.push(household.id);
    await ctx.db.update(households).set({ inviteCode }).where(eq(households.id, household.id));

    const joined = await service.join(joinerId, inviteCode.toLowerCase(), clientIp());

    expect(joined.id).toBe(household.id);
    expect(joined.inviteCode).toBe(inviteCode);
    expect(joined.members.map((member) => member.userId)).toContain(joinerId);
  });
});
