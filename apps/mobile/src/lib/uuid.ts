/**
 * RFC 4122 v4 UUID. Prefers the platform's crypto implementation and falls back
 * to `Math.random` on engines (older Hermes) that lack `crypto.randomUUID`.
 * Client-generated ids only need to be unique and well-formed — they key
 * idempotent offline replay, not security.
 */
export function uuidv4(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 256; i += 1) hex.push((i + 0x100).toString(16).slice(1));

  return (
    hex[bytes[0]!]! +
    hex[bytes[1]!]! +
    hex[bytes[2]!]! +
    hex[bytes[3]!]! +
    '-' +
    hex[bytes[4]!]! +
    hex[bytes[5]!]! +
    '-' +
    hex[bytes[6]!]! +
    hex[bytes[7]!]! +
    '-' +
    hex[bytes[8]!]! +
    hex[bytes[9]!]! +
    '-' +
    hex[bytes[10]!]! +
    hex[bytes[11]!]! +
    hex[bytes[12]!]! +
    hex[bytes[13]!]! +
    hex[bytes[14]!]! +
    hex[bytes[15]!]!
  );
}
