import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './token-crypto.js';

const KEY = randomBytes(32).toString('base64');

describe('token-crypto', () => {
  it('round-trips a token', () => {
    const cipher = encryptToken('apple-refresh-token', KEY);
    expect(cipher).not.toContain('apple-refresh-token');
    expect(decryptToken(cipher, KEY)).toBe('apple-refresh-token');
  });

  it('uses a fresh IV, so the same input never produces the same ciphertext', () => {
    expect(encryptToken('same', KEY)).not.toBe(encryptToken('same', KEY));
  });

  it('rejects tampered ciphertext rather than returning garbage', () => {
    const parts = encryptToken('secret', KEY).split('.');
    const iv = parts[0]!;
    const tag = parts[1]!;
    const dataB64 = parts[2]!;
    const flipped = Buffer.from(dataB64, 'base64');
    flipped.writeUInt8((flipped.readUInt8(0) ^ 0xff) & 0xff, 0);
    expect(decryptToken(`${iv}.${tag}.${flipped.toString('base64')}`, KEY)).toBeNull();
  });

  it('returns null for a wrong key, so a rotated key degrades to no-revoke', () => {
    const cipher = encryptToken('secret', KEY);
    expect(decryptToken(cipher, randomBytes(32).toString('base64'))).toBeNull();
  });

  it('returns null for a malformed payload', () => {
    expect(decryptToken('not-a-payload', KEY)).toBeNull();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => encryptToken('secret', randomBytes(16).toString('base64'))).toThrow();
  });
});
