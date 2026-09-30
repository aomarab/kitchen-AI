import { describe, expect, it } from 'vitest';
import { passwordRuleFailures, passwordSatisfiesClientRules } from './password-rules';

describe('passwordRuleFailures', () => {
  it('derives failing rule message keys from the shared contract schema', () => {
    expect(passwordRuleFailures('kitchen1')).toEqual([
      'auth.passwordRules.tooShort',
      'auth.passwordRules.needsUppercase',
    ]);
    expect(passwordRuleFailures('SHORT12345')).toEqual(['auth.passwordRules.needsLowercase']);
    expect(passwordRuleFailures('longlowercase')).toEqual([
      'auth.passwordRules.needsUppercase',
      'auth.passwordRules.needsDigit',
    ]);
  });

  it('returns no rule failures when the contract password schema passes', () => {
    expect(passwordRuleFailures('Kitchen123')).toEqual([]);
    expect(passwordSatisfiesClientRules('Kitchen123')).toBe(true);
  });
});
