import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { TokenPair } from '@kitchen/contracts';
import { DB, type Database } from '../db/index.js';
import { refreshTokens } from '../db/schema.js';
import { ENV, type Env } from '../config/env.js';
import { AppError } from '../common/errors.js';

/** Parse a TTL like `15m`, `30d`, `12h`, `90s`, or a bare number of seconds. */
export function durationToSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit]!;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * A refresh that loses the atomic revocation claim within this window is a
 * benign concurrent refresh (e.g. a mobile client firing several refreshes as
 * a screen wakes up): reject only that request. A revocation older than this is
 * a replay of a long-spent token — genuine reuse/theft that revokes the family.
 */
const ROTATION_GRACE_MS = 10_000;

/** The transaction-scoped client Drizzle hands to a `db.transaction()` callback. */
type TxClient = Parameters<Parameters<Database['transaction']>[0]>[0];

type RotateOutcome =
  | { kind: 'unclaimed' }
  | { kind: 'expired' }
  | { kind: 'issued'; userId: string; tokens: TokenPair };

/**
 * Issues short-lived JWT access tokens and manages the rotating refresh-token
 * ledger. Refresh tokens are random opaque strings stored only as SHA-256
 * hashes; presenting an already-revoked token is treated as theft and revokes
 * the user's whole family. See spec §3.4.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  private get accessTtlSeconds(): number {
    return durationToSeconds(this.env.JWT_ACCESS_TTL);
  }

  private get refreshTtlSeconds(): number {
    return durationToSeconds(this.env.JWT_REFRESH_TTL);
  }

  async issue(userId: string): Promise<TokenPair> {
    return this.db.transaction((tx) => this.issueWith(tx, userId));
  }

  private async issueWith(tx: TxClient, userId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId });
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    await tx.insert(refreshTokens).values({
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds };
  }

  /**
   * Rotate a refresh token. Revoking the presented token IS the atomic claim: a
   * conditional `UPDATE ... WHERE revoked_at IS NULL RETURNING` means only one
   * of N concurrent refreshes on the same token can win, closing the
   * check-then-act race where two callers both saw `revoked_at = null`. The
   * winner mints the new pair inside the same transaction, so a crash between
   * claim and insert can never leave the user with neither token. Losers are
   * rejected without touching the family when they lost within the grace window
   * ({@link ROTATION_GRACE_MS}); a replay of a token revoked long ago is treated
   * as theft and revokes the whole family.
   */
  async rotate(refreshToken: string): Promise<{ userId: string; tokens: TokenPair }> {
    const tokenHash = hashToken(refreshToken);

    const outcome = await this.db.transaction(async (tx): Promise<RotateOutcome> => {
      const [claimed] = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
        .returning({
          userId: refreshTokens.userId,
          expiresAt: refreshTokens.expiresAt,
        });

      if (!claimed) return { kind: 'unclaimed' };
      if (claimed.expiresAt.getTime() <= Date.now()) return { kind: 'expired' };

      const tokens = await this.issueWith(tx, claimed.userId);
      return { kind: 'issued', userId: claimed.userId, tokens };
    });

    if (outcome.kind === 'issued') return { userId: outcome.userId, tokens: outcome.tokens };
    if (outcome.kind === 'expired') throw AppError.unauthenticated();

    // Nothing claimed: the token is unknown, or a concurrent caller (or a past
    // rotation) already revoked it. Decide between benign race and theft.
    const [existing] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!existing) throw AppError.unauthenticated();

    const revokedAt = existing.revokedAt;
    if (revokedAt && Date.now() - revokedAt.getTime() <= ROTATION_GRACE_MS) {
      // Lost a legitimate concurrent refresh: reject only this request and leave
      // the winner's freshly-issued token and the rest of the family intact.
      throw AppError.unauthenticated();
    }

    // Replay of a long-spent token → treat as theft and revoke the family.
    await this.revokeAllForUser(existing.userId);
    throw AppError.unauthenticated();
  }

  /** Revoke the given refresh token if it belongs to the user (logout). */
  async revoke(refreshToken: string, userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, hashToken(refreshToken)),
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
