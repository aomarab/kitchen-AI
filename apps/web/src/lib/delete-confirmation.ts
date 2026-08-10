import type { Locale } from '@kitchen/contracts';

/**
 * Typed confirmation for account deletion. Localized, and therefore checked on
 * the client: comparing localized prose server-side is exactly the fragility
 * the i18n rules exist to prevent. This is accident prevention — the real
 * controls are the bearer token and the password.
 */
const WORDS: Record<Locale, string> = { en: 'DELETE', ar: 'حذف' };

export function deleteConfirmationWord(locale: Locale): string {
  return WORDS[locale];
}

export function matchesDeleteConfirmation(input: string, locale: Locale): boolean {
  const trimmed = input.trim();
  if (trimmed === '') return false;
  const word = WORDS[locale];
  // Arabic has no case, so `localeCompare` semantics buy nothing; a
  // case-insensitive compare is correct for both and free for one.
  return trimmed.toLocaleUpperCase(locale) === word.toLocaleUpperCase(locale);
}
