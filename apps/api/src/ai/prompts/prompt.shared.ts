import type { Locale } from '@kitchen/contracts';

/** A built prompt: paired system/user text plus the template version used. */
export interface BuiltPrompt {
  system: string;
  user: string;
  version: string;
}

const LANGUAGE_NAME: Record<Locale, string> = {
  en: 'English',
  ar: 'Arabic (العربية)',
};

/**
 * Shared preamble reminding the model that all human-readable text must be
 * written natively in the active locale — never machine-translated. See spec §7.
 */
export function localeDirective(locale: Locale): string {
  return (
    `Write every human-readable string (titles, descriptions, steps, notes) natively in ` +
    `${LANGUAGE_NAME[locale]}. Do not translate from another language; compose directly in ` +
    `${LANGUAGE_NAME[locale]}. Respond with a single JSON object and nothing else — no prose, ` +
    `no markdown fences.`
  );
}

/** Renders a list as a compact, numbered block for a prompt. */
export function numbered(lines: string[]): string {
  if (lines.length === 0) return '(none)';
  return lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
}
