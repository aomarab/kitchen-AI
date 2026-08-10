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

    await expect(revoker().exchangeCode('the-code', 'ai.kitchen.app')).resolves.toBe('apple-refresh');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe('ai.kitchen.app');
    // The client secret is an ES256 JWT: three base64url segments.
    expect(body.get('client_secret')?.split('.')).toHaveLength(3);
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
});
