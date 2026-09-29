import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, generateInviteCode, INVITE_CODE_ALPHABET } from './invite-code.js';

describe('generateInviteCode', () => {
  it('generates ten-character codes from the readable alphabet', () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateInviteCode();

      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((char) => INVITE_CODE_ALPHABET.includes(char))).toBe(true);
    }
  });
});
