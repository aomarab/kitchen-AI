import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import {
  cleanup,
  createTestContext,
  seedHousehold,
  seedIngredients,
  seedUser,
  type TestContext,
} from '../testing/harness.js';
import {
  feedback,
  householdMembers,
  inventoryEvents,
  inventoryItems,
  storageLocations,
  users,
} from '../db/schema.js';
import { DB } from '../db/index.js';
import { ENV } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { OAuthService, type VerifiedIdentity } from './oauth.service.js';
import { APPLE_TOKEN_REVOKER } from './auth.constants.js';
import { MockAppleTokenRevoker } from './apple-token-revoker.js';

const PASSWORD = 'correct-horse';

describe('AuthService.deleteAccount', () => {
  let ctx: TestContext;
  let service: AuthService;
  let revoker: MockAppleTokenRevoker;
  const createdUserIds: string[] = [];
  const createdHouseholdIds: string[] = [];
  const createdIngredientIds: string[] = [];

  const unique = (prefix: string): string =>
    `${prefix}+${randomBytes(6).toString('hex')}@example.com`;

  /**
   * A stubbed OAuthService.verify returning a fixed identity without any
   * network call, mirroring oauth-capture.spec.ts. Apple gets the audience the
   * env is pinned to so revocation can run with the real env override; each
   * call gets a fresh providerAccountId so every login creates a new row.
   */
  const makeStubOAuthService = (): Partial<OAuthService> => ({
    verify: vi
      .fn()
      .mockImplementation(
        async (provider: string): Promise<VerifiedIdentity> => ({
          providerAccountId: `stub-${provider}-${randomBytes(4).toString('hex')}`,
          email: null,
          name: null,
          audience: provider === 'apple' ? 'ai.kitchen.app' : null,
        }),
      ),
  });

  const register = async () => {
    const session = await service.register({
      email: unique('chef'),
      password: PASSWORD,
      displayName: 'Amira',
      locale: 'en',
    });
    createdUserIds.push(session.user.id);
    return session;
  };

  async function seedInventoryEvent(
    householdId: string,
    actorUserId: string,
  ): Promise<{ itemId: string; eventId: string }> {
    const [ingredientId] = await seedIngredients(ctx.db, 1);
    if (!ingredientId) throw new Error('failed to seed ingredient');
    createdIngredientIds.push(ingredientId);

    const [location] = await ctx.db
      .insert(storageLocations)
      .values({ householdId, name: 'Fridge', type: 'fridge' })
      .returning({ id: storageLocations.id });
    if (!location) throw new Error('failed to seed storage location');

    const [item] = await ctx.db
      .insert(inventoryItems)
      .values({
        householdId,
        ingredientId,
        locationId: location.id,
        quantity: '2',
        unit: 'piece',
        source: 'manual',
      })
      .returning({ id: inventoryItems.id });
    if (!item) throw new Error('failed to seed inventory item');

    const [event] = await ctx.db
      .insert(inventoryEvents)
      .values({
        itemId: item.id,
        householdId,
        delta: '2',
        unit: 'piece',
        reason: 'added',
        actorUserId,
      })
      .returning({ id: inventoryEvents.id });
    if (!event) throw new Error('failed to seed inventory event');

    return { itemId: item.id, eventId: event.id };
  }

  beforeAll(async () => {
    ctx = createTestContext();
    revoker = new MockAppleTokenRevoker();
    const encKey = randomBytes(32).toString('base64');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordService,
        TokenService,
        { provide: DB, useValue: ctx.db },
        {
          provide: ENV,
          useValue: { ...ctx.env, APPLE_TOKEN_ENC_KEY: encKey, APPLE_CLIENT_ID: 'ai.kitchen.app' },
        },
        { provide: JwtService, useValue: ctx.jwt },
        { provide: OAuthService, useValue: makeStubOAuthService() },
        { provide: APPLE_TOKEN_REVOKER, useValue: revoker },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  beforeEach(() => {
    revoker.revoked.length = 0;
  });

  afterAll(async () => {
    await cleanup(ctx.db, {
      households: createdHouseholdIds,
      users: createdUserIds,
      ingredients: createdIngredientIds,
    });
    await ctx.client.end({ timeout: 5 });
  });

  it('deletes a password account after the password is verified', async () => {
    const session = await service.register({
      email: unique('chef'),
      password: PASSWORD,
      displayName: 'Amira',
      locale: 'en',
    });
    createdUserIds.push(session.user.id);

    await service.deleteAccount(session.user.id, { password: PASSWORD });

    const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
    expect(rows).toEqual([]);
  });

  it('rejects a missing password with the specific key, so the client can prompt', async () => {
    const session = await register();
    await expect(service.deleteAccount(session.user.id, {})).rejects.toMatchObject({
      messageKey: 'auth.passwordRequired',
    });
    const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
    expect(rows).toHaveLength(1);
  });

  it('rejects a wrong password and leaves the account intact', async () => {
    const session = await register();
    await expect(
      service.deleteAccount(session.user.id, { password: 'wrong' }),
    ).rejects.toMatchObject({ messageKey: 'auth.invalidCredentials' });
    const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
    expect(rows).toHaveLength(1);
  });

  it('needs no password for an OAuth-only account', async () => {
    const session = await service.oauthLogin({ provider: 'apple', idToken: 'apple.id.token' });
    createdUserIds.push(session.user.id);
    await expect(service.deleteAccount(session.user.id, {})).resolves.toBeUndefined();
  });

  it('revokes the Apple token with the decrypted value and the stored client id', async () => {
    const session = await service.oauthLogin({
      provider: 'apple',
      idToken: 'apple.id.token',
      authorizationCode: 'the-code',
    });
    createdUserIds.push(session.user.id);

    await service.deleteAccount(session.user.id, {});

    expect(revoker.revoked).toEqual([
      { refreshToken: 'mock-apple-refresh-ai.kitchen.app', clientId: 'ai.kitchen.app' },
    ]);
  });

  it('deletes the account even when Apple refuses the revoke', async () => {
    const session = await service.oauthLogin({
      provider: 'apple',
      idToken: 'apple.id.token',
      authorizationCode: 'the-code',
    });
    createdUserIds.push(session.user.id);
    vi.spyOn(revoker, 'revoke').mockRejectedValueOnce(new Error('Apple is down'));

    await service.deleteAccount(session.user.id, {});

    const rows = await ctx.db.select().from(users).where(eq(users.id, session.user.id));
    expect(rows).toEqual([]);
  });

  it('removes refresh tokens, so an issued session cannot be refreshed afterwards', async () => {
    const session = await register();
    await service.deleteAccount(session.user.id, { password: PASSWORD });

    await expect(service.refresh(session.tokens.refreshToken)).rejects.toThrow();
  });

  it("cascades the user's feedback rows", async () => {
    const session = await register();
    await ctx.db.insert(feedback).values({
      userId: session.user.id,
      rating: 5,
      message: 'Loved it',
      appVersion: '1.0.0',
      platform: 'ios',
      locale: 'en',
    });

    await service.deleteAccount(session.user.id, { password: PASSWORD });

    const rows = await ctx.db.select().from(feedback).where(eq(feedback.userId, session.user.id));
    expect(rows).toEqual([]);
  });

  it('de-attributes inventory events without changing the pantry quantity', async () => {
    // A household with two members; the departing one recorded an event.
    const departing = await register();
    const survivor = await seedUser(ctx.db);
    createdUserIds.push(survivor);
    const householdId = await seedHousehold(ctx.db, departing.user.id);
    createdHouseholdIds.push(householdId);
    await ctx.db.insert(householdMembers).values({
      householdId,
      userId: survivor,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { itemId, eventId } = await seedInventoryEvent(householdId, departing.user.id);

    await service.deleteAccount(departing.user.id, { password: PASSWORD });

    const [event] = await ctx.db
      .select()
      .from(inventoryEvents)
      .where(eq(inventoryEvents.id, eventId));
    const [item] = await ctx.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId));

    expect(event?.actorUserId).toBeNull();
    // numeric(12,3) round-trips through postgres-js as a padded string.
    expect(item?.quantity).toBe('2.000');
  });

  it('reports hasPassword for both account kinds', async () => {
    const passwordUser = await register();
    expect((await service.me(passwordUser.user.id)).hasPassword).toBe(true);

    const oauthUser = await service.oauthLogin({ provider: 'google', idToken: 'google.id.token' });
    createdUserIds.push(oauthUser.user.id);
    expect((await service.me(oauthUser.user.id)).hasPassword).toBe(false);
  });
});
