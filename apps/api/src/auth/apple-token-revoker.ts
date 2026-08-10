import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** Apple rejects client secrets valid for more than six months; ours lives for minutes. */
const CLIENT_SECRET_TTL_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Apple's token endpoints, behind a port so the whole system runs offline and
 * free by default (`APPLE_REVOKE_MOCK`), exactly like the AI providers.
 */
export interface AppleTokenRevoker {
  /**
   * Trades Apple's single-use authorization code for a refresh token.
   * Returns null on any failure — sign-in must not break because Apple's token
   * endpoint is unreachable.
   */
  exchangeCode(code: string, clientId: string): Promise<string | null>;
  /** Throws on failure. The caller decides whether that is fatal (it is not). */
  revoke(refreshToken: string, clientId: string): Promise<void>;
}

export class MockAppleTokenRevoker implements AppleTokenRevoker {
  readonly revoked: Array<{ refreshToken: string; clientId: string }> = [];

  async exchangeCode(_code: string, clientId: string): Promise<string | null> {
    return `mock-apple-refresh-${clientId}`;
  }

  async revoke(refreshToken: string, clientId: string): Promise<void> {
    this.revoked.push({ refreshToken, clientId });
  }
}

export class HttpAppleTokenRevoker implements AppleTokenRevoker {
  private readonly logger = new Logger(HttpAppleTokenRevoker.name);

  constructor(private readonly env: Env) {}

  async exchangeCode(code: string, clientId: string): Promise<string | null> {
    try {
      const response = await this.post(APPLE_TOKEN_URL, {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: this.clientSecret(clientId),
      });
      if (!response.ok) {
        this.logger.warn(`Apple code exchange failed: ${response.status} ${await response.text()}`);
        return null;
      }
      const payload = (await response.json()) as { refresh_token?: string };
      return payload.refresh_token ?? null;
    } catch (error) {
      this.logger.warn(`Apple code exchange errored: ${String(error)}`);
      return null;
    }
  }

  async revoke(refreshToken: string, clientId: string): Promise<void> {
    const response = await this.post(APPLE_REVOKE_URL, {
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: clientId,
      client_secret: this.clientSecret(clientId),
    });
    if (!response.ok) {
      throw new Error(`Apple revoke failed: ${response.status} ${await response.text()}`);
    }
  }

  private post(url: string, fields: Record<string, string>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /**
   * Apple's "client secret" is an ES256 JWT we sign ourselves with the `.p8`
   * key, scoped to the client id the token was issued to.
   */
  private clientSecret(clientId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: this.env.APPLE_KEY_ID, typ: 'JWT' };
    const payload = {
      iss: this.env.APPLE_TEAM_ID,
      iat: now,
      exp: now + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: clientId,
    };
    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signer = createSign('SHA256');
    signer.update(signingInput);
    const signature = signer.sign({ key: this.env.APPLE_PRIVATE_KEY, dsaEncoding: 'ieee-p1363' });
    return `${signingInput}.${signature.toString('base64url')}`;
  }
}

function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
