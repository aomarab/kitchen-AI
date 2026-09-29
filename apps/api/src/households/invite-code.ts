import { randomInt } from 'node:crypto';

/**
 * Invite-code alphabet with visually ambiguous characters removed (`0`, `O`,
 * `1`, `I`) so codes are safe to read aloud or copy by hand. See spec §3.4.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 10;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}
