import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type {
  DeleteMeRequest,
  LoginRequest,
  OAuthLoginRequest,
  RegisterRequest,
  Session,
  TokenPair,
  UpdateMeRequest,
  User,
} from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { householdMembers, oauthAccounts, profiles, users } from '../db/schema.js';
import { AppError } from '../common/errors.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { OAuthService, type VerifiedIdentity } from './oauth.service.js';
import { toUser, type UserRow } from './auth.serializer.js';
import { APPLE_TOKEN_REVOKER } from './auth.constants.js';
import { type AppleTokenRevoker } from './apple-token-revoker.js';
import { encryptToken, decryptToken } from './token-crypto.js';
import { applyHouseholdSuccession } from './account-deletion.js';
import { ENV, type Env } from '../config/env.js';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(OAuthService) private readonly oauth: OAuthService,
    @Inject(APPLE_TOKEN_REVOKER) private readonly appleTokens: AppleTokenRevoker,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(dto: RegisterRequest): Promise<Session> {
    const passwordHash = await this.passwords.hash(dto.password);
    let row: UserRow | undefined;
    try {
      [row] = await this.db
        .insert(users)
        .values({
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
          locale: dto.locale,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict('auth.emailTaken');
      throw error;
    }
    if (!row) throw new AppError('INTERNAL_ERROR');

    await this.ensureProfile(row.id);
    const tokens = await this.tokens.issue(row.id);
    return { user: toUser(row), tokens, householdIds: [] };
  }

  async login(dto: LoginRequest): Promise<Session> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, dto.email.toLowerCase()))
      .limit(1);

    if (!row || !row.passwordHash) throw AppError.unauthenticated('auth.invalidCredentials');
    const ok = await this.passwords.verify(dto.password, row.passwordHash);
    if (!ok) throw AppError.unauthenticated('auth.invalidCredentials');

    const tokens = await this.tokens.issue(row.id);
    return { user: toUser(row), tokens, householdIds: await this.householdIds(row.id) };
  }

  async oauthLogin(dto: OAuthLoginRequest): Promise<Session> {
    const identity = await this.oauth.verify(dto.provider, dto.idToken);

    const [existingLink] = await this.db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, dto.provider),
          eq(oauthAccounts.providerAccountId, identity.providerAccountId),
        ),
      )
      .limit(1);

    const userRow = existingLink
      ? await this.requireUser(existingLink.userId)
      : await this.linkOrCreateOAuthUser(dto, identity);

    await this.captureAppleRefreshToken(userRow.id, dto, identity);

    const tokens = await this.tokens.issue(userRow.id);
    return { user: toUser(userRow), tokens, householdIds: await this.householdIds(userRow.id) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const { tokens } = await this.tokens.rotate(refreshToken);
    return tokens;
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken, userId);
  }

  async me(userId: string): Promise<User> {
    return toUser(await this.requireUser(userId));
  }

  async updateMe(userId: string, dto: UpdateMeRequest): Promise<User> {
    if (Object.keys(dto).length === 0) return this.me(userId);
    const [row] = await this.db
      .update(users)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw AppError.notFound();
    return toUser(row);
  }

  /**
   * Irreversibly deletes the account. Required by App Store Guideline
   * 5.1.1(v) and Google Play's data-deletion policy.
   *
   * Ordering matters: revoke first, outside the transaction. Network I/O
   * inside a transaction holds row locks for the length of a third-party
   * round trip, and revoking after a successful delete would mean losing the
   * token permanently on any failure. Revoking first has the only recoverable
   * failure mode — the user re-links Apple and tries again.
   */
  async deleteAccount(userId: string, dto: DeleteMeRequest): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppError.notFound();

    if (user.passwordHash !== null) {
      if (!dto.password) throw AppError.unauthenticated('auth.passwordRequired');
      const ok = await this.passwords.verify(dto.password, user.passwordHash);
      // Reuse the existing key rather than minting one that distinguishes
      // "wrong password" from "no such account" in a new place.
      if (!ok) throw AppError.unauthenticated('auth.invalidCredentials');
    }

    await this.revokeAppleTokens(userId);

    await this.db.transaction(async (tx) => {
      await applyHouseholdSuccession(tx, userId);
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  /**
   * Best-effort. A revoke failure is logged and ignored: blocking a user's
   * account deletion on an Apple outage would itself violate the guideline
   * the revoke exists to satisfy.
   */
  private async revokeAppleTokens(userId: string): Promise<void> {
    if (this.env.APPLE_TOKEN_ENC_KEY.trim() === '') return;

    const links = await this.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, 'apple')));

    for (const link of links) {
      if (!link.refreshTokenEncrypted || !link.revokeClientId) continue;
      const token = decryptToken(link.refreshTokenEncrypted, this.env.APPLE_TOKEN_ENC_KEY);
      // A null here means a rotated or wrong key. Treated exactly like "no
      // token": skip the revoke, delete anyway.
      if (!token) continue;
      try {
        await this.appleTokens.revoke(token, link.revokeClientId);
      } catch (error) {
        this.logger.warn(`Apple revoke failed for user ${userId}: ${String(error)}`);
      }
    }
  }

  /**
   * Apple's authorization code is single-use and expires in about five
   * minutes, so it can only be exchanged here, at sign-in. Everything is
   * best-effort: a failure leaves us unable to revoke at deletion time, which
   * is bad, but breaking authentication to protect a deletion-time nicety
   * would be worse.
   */
  private async captureAppleRefreshToken(
    userId: string,
    dto: OAuthLoginRequest,
    identity: VerifiedIdentity,
  ): Promise<void> {
    try {
      if (dto.provider !== 'apple' || !dto.authorizationCode || !identity.audience) return;
      if (this.env.APPLE_TOKEN_ENC_KEY.trim() === '') return;

      const refreshToken = await this.appleTokens.exchangeCode(
        dto.authorizationCode,
        identity.audience,
      );
      if (!refreshToken) return;

      await this.db
        .update(oauthAccounts)
        .set({
          refreshTokenEncrypted: encryptToken(refreshToken, this.env.APPLE_TOKEN_ENC_KEY),
          revokeClientId: identity.audience,
        })
        .where(
          and(
            eq(oauthAccounts.provider, 'apple'),
            eq(oauthAccounts.providerAccountId, identity.providerAccountId),
          ),
        );
    } catch (error) {
      this.logger.warn(
        { userId, err: error },
        'captureAppleRefreshToken failed — sign-in continues without stored token',
      );
    }
  }

  /**
   * Links an OAuth identity to an existing account by email, or creates one.
   *
   * `email` is non-null only when the provider reported the address as
   * verified ({@link OAuthService}); an unverified address must never reach
   * here, because matching on it would hand the attacker a session for any
   * account whose email they can name.
   */
  private async linkOrCreateOAuthUser(
    dto: OAuthLoginRequest,
    identity: VerifiedIdentity,
  ): Promise<UserRow> {
    const { providerAccountId, email } = identity;
    return this.db.transaction(async (tx) => {
      let userRow: UserRow | undefined;

      if (email) {
        [userRow] = await tx
          .select()
          .from(users)
          .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
          .limit(1);
      }

      if (!userRow) {
        // The provider's own spelling of the name beats the email local part,
        // which reads like a username ("aaomarab") rather than a person.
        const displayName = identity.name ?? (email ? email.split('@')[0]! : 'New user');
        [userRow] = await tx
          .insert(users)
          .values({
            email: email ?? `${providerAccountId}@${dto.provider}.oauth.local`,
            passwordHash: null,
            displayName,
            locale: dto.locale ?? 'en',
          })
          .returning();
        if (!userRow) throw new AppError('INTERNAL_ERROR');
        await tx.insert(profiles).values({ userId: userRow.id }).onConflictDoNothing();
      }

      await tx
        .insert(oauthAccounts)
        .values({ userId: userRow.id, provider: dto.provider, providerAccountId })
        .onConflictDoNothing();

      return userRow;
    });
  }

  private async ensureProfile(userId: string): Promise<void> {
    await this.db.insert(profiles).values({ userId }).onConflictDoNothing();
  }

  private async requireUser(userId: string): Promise<UserRow> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!row) throw AppError.notFound();
    return row;
  }

  private async householdIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));
    return rows.map((r) => r.householdId);
  }
}
