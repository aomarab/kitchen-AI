import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Reversible encryption for the Apple refresh token.
 *
 * Our own refresh tokens are stored hashed, which is strictly better — but
 * revoking an Apple token requires presenting it to Apple, so it has to come
 * back out in plaintext. AES-256-GCM gives confidentiality plus an
 * authentication tag, so a tampered row is detected rather than silently
 * decrypted into nonsense.
 */
const IV_BYTES = 12;

function readKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('APPLE_TOKEN_ENC_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export function encryptToken(plaintext: string, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', readKey(keyBase64), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

/**
 * Returns null rather than throwing on any failure — a wrong key, a tampered
 * row or a malformed payload. Deletion treats "no token" and "undecryptable
 * token" identically: skip the revoke and delete anyway. Throwing here would
 * block a user's account deletion on a key-rotation mistake.
 */
export function decryptToken(payload: string, keyBase64: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  try {
    const decipher = createDecipheriv('aes-256-gcm', readKey(keyBase64), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
