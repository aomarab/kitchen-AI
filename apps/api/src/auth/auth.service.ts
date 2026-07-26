import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type {
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
import { OAuthService } from './oauth.service.js';
import { toUser, type UserRow } from './auth.serializer.js';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(OAuthService) private readonly oauth: OAuthService,
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
      : await this.linkOrCreateOAuthUser(dto, identity.providerAccountId, identity.email);

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
   * Links an OAuth identity to an existing account by email, or creates one.
   *
   * `email` is non-null only when the provider reported the address as
   * verified ({@link OAuthService}); an unverified address must never reach
   * here, because matching on it would hand the attacker a session for any
   * account whose email they can name.
   */
  private async linkOrCreateOAuthUser(
    dto: OAuthLoginRequest,
    providerAccountId: string,
    email: string | null,
  ): Promise<UserRow> {
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
        const displayName = email ? email.split('@')[0]! : 'New user';
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
