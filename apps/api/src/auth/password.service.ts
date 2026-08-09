import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type BinaryLike,
  type ScryptOptions,
} from 'node:crypto';

function scryptAsync(
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** scrypt work factors. N must be a power of two; these are OWASP-reasonable. */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * Password hashing with Node's built-in `crypto.scrypt` — no native modules
 * (bcrypt/argon2) so the API stays pure-JS and portable. The stored value is
 * self-describing: `scrypt$N$r$p$saltB64$hashB64`, so work factors can change
 * without invalidating existing hashes.
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LEN);
    const derived = await scryptAsync(password, salt, KEY_LEN, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const saltB64 = parts[4]!;
    const hashB64 = parts[5]!;
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    let derived: Buffer;
    try {
      derived = await scryptAsync(password, salt, expected.length, { N: n, r, p });
    } catch {
      return false;
    }

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
