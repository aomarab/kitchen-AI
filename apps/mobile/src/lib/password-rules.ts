import { passwordSchema } from '@kitchen/contracts';
import type { MessageKey } from '@kitchen/i18n';

export type PasswordRuleKey = Extract<MessageKey, `auth.passwordRules.${string}`>;

const PASSWORD_RULE_PREFIX = 'auth.passwordRules.';

function isPasswordRuleKey(message: string): message is PasswordRuleKey {
  return message.startsWith(PASSWORD_RULE_PREFIX);
}

export function passwordRuleFailures(password: string): PasswordRuleKey[] {
  const parsed = passwordSchema.safeParse(password);
  if (parsed.success) return [];

  const failures: PasswordRuleKey[] = [];
  for (const issue of parsed.error.issues) {
    if (isPasswordRuleKey(issue.message) && !failures.includes(issue.message)) {
      failures.push(issue.message);
    }
  }
  return failures;
}

export function passwordSatisfiesClientRules(password: string): boolean {
  return passwordRuleFailures(password).length === 0;
}
