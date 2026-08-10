import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { cleanup, createTestContext, type TestContext } from '../testing/harness.js';
import { users } from '../db/schema.js';
import { DB } from '../db/index.js';
import { ENV } from '../config/env.js';
import { AppExceptionFilter } from '../common/errors.js';
import { AuthGuard } from '../common/auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { OAuthService, type VerifiedIdentity } from './oauth.service.js';
import { APPLE_TOKEN_REVOKER } from './auth.constants.js';
import { MockAppleTokenRevoker } from './apple-token-revoker.js';

const PASSWORD = 'Correct-horse1';

describe('DELETE /me — HTTP guard and contract', () => {
  let ctx: TestContext;
  let app: INestApplication;
  const createdUserIds: string[] = [];

  const unique = (prefix: string): string =>
    `${prefix}+${randomBytes(6).toString('hex')}@example.com`;

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

  beforeAll(async () => {
    ctx = createTestContext();
    const encKey = randomBytes(32).toString('base64');

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: ctx.env.JWT_SECRET,
          signOptions: { expiresIn: ctx.env.JWT_ACCESS_TTL },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        PasswordService,
        TokenService,
        AuthGuard,
        { provide: DB, useValue: ctx.db },
        {
          provide: ENV,
          useValue: { ...ctx.env, APPLE_TOKEN_ENC_KEY: encKey, APPLE_CLIENT_ID: 'ai.kitchen.app' },
        },
        { provide: OAuthService, useValue: makeStubOAuthService() },
        { provide: APPLE_TOKEN_REVOKER, useValue: new MockAppleTokenRevoker() },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(ctx.db, { users: createdUserIds });
    await ctx.client.end({ timeout: 5 });
  });

  it('rejects anonymous callers with 401 and leaves the user row intact', async () => {
    // Register a user so we can confirm the row survives a guard rejection.
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: unique('anon-del'), password: PASSWORD, displayName: 'Anon', locale: 'en' });
    expect(regRes.status).toBe(201);
    const userId: string = regRes.body.user.id;
    createdUserIds.push(userId);

    const res = await request(app.getHttpServer())
      .delete('/me')
      .send({ password: PASSWORD });

    expect(res.status).toBe(401);

    const rows = await ctx.db.select().from(users).where(eq(users.id, userId));
    expect(rows).toHaveLength(1);
  });

  it('deletes the account when a valid bearer token and correct password are sent', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: unique('del-ok'), password: PASSWORD, displayName: 'Chef', locale: 'en' });
    expect(regRes.status).toBe(201);
    const userId: string = regRes.body.user.id;
    const token: string = regRes.body.tokens.accessToken;
    createdUserIds.push(userId);

    const res = await request(app.getHttpServer())
      .delete('/me')
      .set('authorization', `Bearer ${token}`)
      .send({ password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const rows = await ctx.db.select().from(users).where(eq(users.id, userId));
    expect(rows).toEqual([]);
    // Already deleted — remove from cleanup list to avoid FK error.
    createdUserIds.splice(createdUserIds.indexOf(userId), 1);
  });

  it('rejects a wrong password with the error envelope and leaves the user row intact', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: unique('del-bad-pw'),
        password: PASSWORD,
        displayName: 'Chef',
        locale: 'en',
      });
    expect(regRes.status).toBe(201);
    const userId: string = regRes.body.user.id;
    const token: string = regRes.body.tokens.accessToken;
    createdUserIds.push(userId);

    const res = await request(app.getHttpServer())
      .delete('/me')
      .set('authorization', `Bearer ${token}`)
      .send({ password: 'totally-wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      code: 'UNAUTHENTICATED',
      messageKey: 'auth.invalidCredentials',
    });

    const rows = await ctx.db.select().from(users).where(eq(users.id, userId));
    expect(rows).toHaveLength(1);
  });
});
