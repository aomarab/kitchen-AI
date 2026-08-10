import { createPublicKey, createVerify } from 'node:crypto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HttpAppleTokenRevoker, MockAppleTokenRevoker } from './apple-token-revoker.js';

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2
OF/2NxApJCzGCEDdfSp6VQO30hyhRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r
1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087G
-----END PRIVATE KEY-----`;

function revoker(): HttpAppleTokenRevoker {
  return new HttpAppleTokenRevoker({
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: PRIVATE_KEY,
  } as never);
}

describe('MockAppleTokenRevoker', () => {
  it('returns a deterministic token so the full flow runs offline', async () => {
    const mock = new MockAppleTokenRevoker();
    await expect(mock.exchangeCode('code', 'ai.kitchen.app')).resolves.toBe(
      'mock-apple-refresh-ai.kitchen.app',
    );
  });

  it('records revocations so specs can assert deletion revoked the token', async () => {
    const mock = new MockAppleTokenRevoker();
    await mock.revoke('token', 'ai.kitchen.app');
    expect(mock.revoked).toEqual([{ refreshToken: 'token', clientId: 'ai.kitchen.app' }]);
  });
});

describe('HttpAppleTokenRevoker', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges an authorization code and returns the refresh token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ refresh_token: 'apple-refresh' }),
    });

    const clientId = 'ai.kitchen.app';
    await expect(revoker().exchangeCode('the-code', clientId)).resolves.toBe('apple-refresh');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe(clientId);

    // ── client-secret JWT deep assertions ──────────────────────────────────
    const jwt = body.get('client_secret')!;
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);

    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    expect(header).toMatchObject({ alg: 'ES256', typ: 'JWT', kid: 'KEY1234567' });

    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    expect(claims.iss).toBe('TEAM123456');
    expect(claims.aud).toBe('https://appleid.apple.com');
    // sub must be the clientId passed into the call, not a hardcoded string —
    // this is what makes per-platform client ids work.
    expect(claims.sub).toBe(clientId);
    expect(claims.exp).toBeGreaterThan(claims.iat);
    // Lifetime must be well under Apple's 6-month ceiling (15_724_800 s).
    expect(claims.exp - claims.iat).toBeLessThan(15_724_800);

    // ── signature encoding assertion ──────────────────────────────────────
    // P1363 for P-256 is always exactly 64 bytes (two 32-byte integers).
    // Node's default DER encoding is variable-length (typically 70–72 bytes).
    // Deleting `dsaEncoding: 'ieee-p1363'` from the signing call would produce
    // a longer signature and fail this assertion — that is intentional.
    const sigBuf = Buffer.from(parts[2]!, 'base64url');
    expect(sigBuf.length).toBe(64);

    // ── cryptographic verification ────────────────────────────────────────
    const publicKey = createPublicKey(PRIVATE_KEY);
    const verifier = createVerify('SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    expect(
      verifier.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, sigBuf),
    ).toBe(true);
  });

  it('returns null when Apple rejects the exchange, so sign-in still succeeds', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_grant' });
    await expect(revoker().exchangeCode('bad', 'ai.kitchen.app')).resolves.toBeNull();
  });

  it('returns null when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(revoker().exchangeCode('code', 'ai.kitchen.app')).resolves.toBeNull();
  });

  it('posts the refresh token to the revoke endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });

    await revoker().revoke('apple-refresh', 'ai.kitchen.app');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('token')).toBe('apple-refresh');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('ai.kitchen.app');
  });

  it('throws when Apple rejects the revoke, so the caller can log it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_client' });
    await expect(revoker().revoke('token', 'ai.kitchen.app')).rejects.toThrow();
  });

  // ── network-error asymmetry ───────────────────────────────────────────────
  // When fetch itself rejects (DNS failure, connection reset, AbortError from
  // the 10-second timeout), the two methods behave DIFFERENTLY by design:
  //   • exchangeCode must resolve to null — sign-in must never break.
  //   • revoke must re-throw — Task 8 catches it, logs it, and deletes the
  //     account anyway, so swallowing the error would silently skip logging.
  // A future maintainer must not add a catch-and-swallow to revoke believing
  // the non-2xx path is the only way it throws.
  it('resolves null when fetch rejects in exchangeCode (network error is non-fatal)', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));
    await expect(revoker().exchangeCode('code', 'ai.kitchen.app')).resolves.toBeNull();
  });

  it('re-throws when fetch rejects in revoke (network error must propagate to caller)', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));
    await expect(revoker().revoke('token', 'ai.kitchen.app')).rejects.toThrow();
  });
});
