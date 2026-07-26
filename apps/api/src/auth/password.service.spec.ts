import { describe, it, expect } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('round-trips a password and verifies it', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(service.verify('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('s3cret-p@ss');
    await expect(service.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a distinct hash each time (random salt)', async () => {
    const a = await service.hash('same-password');
    const b = await service.hash('same-password');
    expect(a).not.toEqual(b);
    await expect(service.verify('same-password', a)).resolves.toBe(true);
    await expect(service.verify('same-password', b)).resolves.toBe(true);
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(service.verify('x', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(service.verify('x', 'scrypt$16384$8$1$onlyfive')).resolves.toBe(false);
  });
});
