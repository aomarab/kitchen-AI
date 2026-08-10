import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { createTestContext, cleanup, type TestContext } from '../testing/harness.js';
import { oauthAccounts } from '../db/schema.js';
import { DB } from '../db/index.js';
import { ENV } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { OAuthService, type VerifiedIdentity } from './oauth.service.js';
import { APPLE_TOKEN_REVOKER } from './auth.constants.js';
import { MockAppleTokenRevoker } from './apple-token-revoker.js';
import { decryptToken } from './token-crypto.js';

describe('AuthService Apple refresh token capture', () => {
  let ctx: TestContext;
  let service: AuthService;
  let revoker: MockAppleTokenRevoker;
  let encKey: string;
  const createdUserIds: string[] = [];

  /**
   * A stub OAuthService.verify that returns a fixed Apple identity without any
   * network calls. The audience matches the single entry in APPLE_CLIENT_ID so
   * the spec runs with the real env override rather than requiring Apple JWKS.
   * Each call gets a unique providerAccountId so every test creates a fresh row.
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

  beforeAll(async () => {
    ctx = createTestContext();
    revoker = new MockAppleTokenRevoker();

    // Generate a fresh 32-byte AES key for this spec run.
    encKey = randomBytes(32).toString('base64');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordService,
        TokenService,
        {
          provide: DB,
          useValue: ctx.db,
        },
        {
          provide: ENV,
          useValue: { ...ctx.env, APPLE_TOKEN_ENC_KEY: encKey, APPLE_CLIENT_ID: 'ai.kitchen.app' },
        },
        {
          provide: JwtService,
          useValue: ctx.jwt,
        },
        {
          provide: OAuthService,
          useValue: makeStubOAuthService(),
        },
        {
          provide: APPLE_TOKEN_REVOKER,
          useValue: revoker,
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: createdUserIds });
    await ctx.client.end({ timeout: 5 });
  });

  it('stores the encrypted Apple refresh token and the validated audience', async () => {
    const session = await service.oauthLogin({
      provider: 'apple',
      idToken: 'apple.id.token',
      authorizationCode: 'the-code',
    });
    createdUserIds.push(session.user.id);

    const [link] = await ctx.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, session.user.id))
      .limit(1);

    expect(link?.revokeClientId).toBe('ai.kitchen.app');
    expect(link?.refreshTokenEncrypted).not.toBeNull();
    expect(link?.refreshTokenEncrypted).not.toContain('mock-apple-refresh');
    expect(decryptToken(link!.refreshTokenEncrypted!, encKey)).toBe(
      'mock-apple-refresh-ai.kitchen.app',
    );
  });

  it('signs in without a token when no authorization code is sent', async () => {
    const session = await service.oauthLogin({ provider: 'apple', idToken: 'apple.id.token' });
    createdUserIds.push(session.user.id);

    const [link] = await ctx.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, session.user.id))
      .limit(1);

    expect(link?.refreshTokenEncrypted).toBeNull();
  });

  it('still signs in when Apple refuses the exchange', async () => {
    vi.spyOn(revoker, 'exchangeCode').mockResolvedValueOnce(null);

    const session = await service.oauthLogin({
      provider: 'apple',
      idToken: 'apple.id.token',
      authorizationCode: 'the-code',
    });
    createdUserIds.push(session.user.id);

    expect(session.tokens.accessToken).toBeTruthy();
  });

  it('ignores an authorization code from Google, which needs no revocation', async () => {
    const spy = vi.spyOn(revoker, 'exchangeCode');
    spy.mockClear();

    const session = await service.oauthLogin({
      provider: 'google',
      idToken: 'google.id.token',
      authorizationCode: 'the-code',
    });
    createdUserIds.push(session.user.id);

    expect(spy).not.toHaveBeenCalled();
  });
});
