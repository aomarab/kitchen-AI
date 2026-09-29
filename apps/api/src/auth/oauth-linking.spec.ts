import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { createTestContext, cleanup, type TestContext } from '../testing/harness.js';
import { users } from '../db/schema.js';
import { DB } from '../db/index.js';
import { ENV } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { OAuthService, type VerifiedIdentity } from './oauth.service.js';
import { APPLE_TOKEN_REVOKER } from './auth.constants.js';
import { MockAppleTokenRevoker } from './apple-token-revoker.js';

describe('AuthService OAuth email linking', () => {
  let ctx: TestContext;
  let service: AuthService;
  let nextIdentity: VerifiedIdentity;
  const createdUserIds: string[] = [];

  const makeIdentity = (overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
    providerAccountId: `google-${randomUUID()}`,
    email: `oauth-${randomUUID()}@example.com`,
    name: 'OAuth User',
    audience: 'test-google-client',
    ...overrides,
  });

  beforeAll(async () => {
    ctx = createTestContext();
    nextIdentity = makeIdentity();

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
          useValue: ctx.env,
        },
        {
          provide: JwtService,
          useValue: ctx.jwt,
        },
        {
          provide: OAuthService,
          useValue: {
            verify: vi.fn(async () => nextIdentity),
          } satisfies Partial<OAuthService>,
        },
        {
          provide: APPLE_TOKEN_REVOKER,
          useValue: new MockAppleTokenRevoker(),
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await cleanup(ctx.db, { users: createdUserIds });
    await ctx.client.end({ timeout: 5 });
  });

  it('drops an existing password and revokes old sessions when verified OAuth links by email', async () => {
    const email = `pre-hijack-${randomUUID()}@example.com`;
    const password = 'CorrectHorse9';
    const registered = await service.register({
      email,
      password,
      displayName: 'Attacker-chosen Name',
      locale: 'en',
    });
    createdUserIds.push(registered.user.id);

    nextIdentity = makeIdentity({
      email: email.toUpperCase(),
      name: 'Verified Owner',
    });

    const oauthSession = await service.oauthLogin({
      provider: 'google',
      idToken: 'google.id.token',
    });

    expect(oauthSession.user.id).toBe(registered.user.id);
    expect(oauthSession.user.hasPassword).toBe(false);
    expect(oauthSession.tokens.refreshToken).toBeTruthy();

    const [row] = await ctx.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, registered.user.id))
      .limit(1);
    expect(row?.passwordHash).toBeNull();

    await expect(service.login({ email, password })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      messageKey: 'auth.invalidCredentials',
    });
    await expect(service.refresh(registered.tokens.refreshToken)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });

    await expect(service.refresh(oauthSession.tokens.refreshToken)).resolves.toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: expect.any(Number),
    });
  });

  it('creates a fresh OAuth-only user without requiring password cleanup', async () => {
    nextIdentity = makeIdentity({
      email: `fresh-oauth-${randomUUID()}@example.com`,
      name: 'Fresh OAuth User',
    });

    const session = await service.oauthLogin({
      provider: 'google',
      idToken: 'google.id.token',
      locale: 'ar',
    });
    createdUserIds.push(session.user.id);

    expect(session.user.email).toBe(nextIdentity.email);
    expect(session.user.displayName).toBe('Fresh OAuth User');
    expect(session.user.locale).toBe('ar');
    expect(session.user.hasPassword).toBe(false);
    expect(session.tokens.refreshToken).toBeTruthy();
  });
});
