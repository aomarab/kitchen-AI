import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import type { OAuthProvider } from '@kitchen/contracts';
import { AppError } from '../common/errors.js';
import { ENV, type Env } from '../config/env.js';

export interface VerifiedIdentity {
  providerAccountId: string;
  email: string | null;
}

interface AppleJwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const JWKS_TTL_MS = 60 * 60 * 1000;

function decodeJwtPart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

/**
 * Both providers report `email_verified` as either a boolean or the string
 * `'true'` (Google's tokeninfo endpoint returns every claim as a string).
 * Anything else — including the claim being absent — counts as unverified.
 */
function isVerifiedEmail(claim: unknown): boolean {
  return claim === true || claim === 'true';
}

/**
 * Verifies Apple / Google identity tokens without adding a JWT dependency:
 * Google via its public `tokeninfo` endpoint, Apple by validating the RS256
 * signature against Apple's published JWKS. The audience (client id) is pinned
 * to `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` (read from the validated {@link Env},
 * never `process.env`), which {@link loadEnv} requires in production. An email
 * is only returned when the provider states it verified the address, because
 * the caller links accounts on it. The two `verify*` methods are the single
 * swap-point for a different strategy.
 */
@Injectable()
export class OAuthService implements OnModuleInit {
  private readonly logger = new Logger(OAuthService.name);
  private appleJwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  onModuleInit(): void {
    if (!this.env.GOOGLE_CLIENT_ID) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID is empty — Google ID token audience (aud) is NOT pinned. Set it before production.',
      );
    }
    if (!this.env.APPLE_CLIENT_ID) {
      this.logger.warn(
        'APPLE_CLIENT_ID is empty — Apple ID token audience (aud) is NOT pinned. Set it before production.',
      );
    }
  }

  async verify(provider: OAuthProvider, idToken: string): Promise<VerifiedIdentity> {
    return provider === 'google' ? this.verifyGoogle(idToken) : this.verifyApple(idToken);
  }

  private async verifyGoogle(idToken: string): Promise<VerifiedIdentity> {
    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      aud?: string;
      iss?: string;
      exp?: string;
    };
    try {
      const response = await fetch(
        `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!response.ok) throw AppError.unauthenticated('auth.invalidCredentials');
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.warn(`Google token verification failed: ${String(error)}`);
      throw new AppError('EXTERNAL_SERVICE_ERROR');
    }

    if (!payload.sub || !payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
      throw AppError.unauthenticated('auth.invalidCredentials');
    }
    if (payload.exp && Number(payload.exp) * 1000 <= Date.now()) {
      throw AppError.unauthenticated('auth.invalidCredentials');
    }
    this.assertAudience(this.env.GOOGLE_CLIENT_ID, payload.aud);

    return {
      providerAccountId: payload.sub,
      email: isVerifiedEmail(payload.email_verified) ? (payload.email ?? null) : null,
    };
  }

  private async verifyApple(idToken: string): Promise<VerifiedIdentity> {
    const segments = idToken.split('.');
    if (segments.length !== 3) throw AppError.unauthenticated('auth.invalidCredentials');
    const [headerB64, payloadB64, signatureB64] = segments as [string, string, string];

    const header = decodeJwtPart<{ kid?: string; alg?: string }>(headerB64);
    if (!header.kid || header.alg !== 'RS256') {
      throw AppError.unauthenticated('auth.invalidCredentials');
    }

    const jwk = (await this.appleJwks()).find((key) => key.kid === header.kid);
    if (!jwk) throw AppError.unauthenticated('auth.invalidCredentials');

    const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
    const signed = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64, 'base64url');
    if (!cryptoVerify('RSA-SHA256', signed, publicKey, signature)) {
      throw AppError.unauthenticated('auth.invalidCredentials');
    }

    const payload = decodeJwtPart<{
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      iss?: string;
      aud?: string;
      exp?: number;
    }>(payloadB64);

    if (payload.iss !== APPLE_ISSUER || !payload.sub) {
      throw AppError.unauthenticated('auth.invalidCredentials');
    }
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      throw AppError.unauthenticated('auth.invalidCredentials');
    }
    this.assertAudience(this.env.APPLE_CLIENT_ID, payload.aud);

    return {
      providerAccountId: payload.sub,
      email: isVerifiedEmail(payload.email_verified) ? (payload.email ?? null) : null,
    };
  }

  private assertAudience(expected: string | undefined, actual: string | undefined): void {
    if (!expected) {
      // `loadEnv` refuses to boot production without both client ids, so this
      // is unreachable there. Fail closed anyway rather than let a single
      // misconfigured guard turn into an account takeover.
      if (this.env.NODE_ENV === 'production') {
        throw AppError.unauthenticated('auth.invalidCredentials');
      }
      return;
    }
    if (actual !== expected) {
      throw AppError.unauthenticated('auth.invalidCredentials');
    }
  }

  private async appleJwks(): Promise<AppleJwk[]> {
    if (this.appleJwksCache && Date.now() - this.appleJwksCache.fetchedAt < JWKS_TTL_MS) {
      return this.appleJwksCache.keys;
    }
    try {
      const response = await fetch(APPLE_JWKS_URL);
      if (!response.ok) throw new Error(`JWKS status ${response.status}`);
      const body = (await response.json()) as { keys: AppleJwk[] };
      this.appleJwksCache = { keys: body.keys, fetchedAt: Date.now() };
      return body.keys;
    } catch (error) {
      this.logger.warn(`Apple JWKS fetch failed: ${String(error)}`);
      throw new AppError('EXTERNAL_SERVICE_ERROR');
    }
  }
}
